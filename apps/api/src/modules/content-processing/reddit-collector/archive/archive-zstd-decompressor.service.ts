import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { LoggerService } from '../../../../shared';

/**
 * Archive ZSTD Decompression Service
 *
 * System-based zstd decompression for large Reddit archive file streaming.
 * Uses the system zstd binary via child processes to achieve:
 * - True streaming decompression (no memory limits)
 * - Efficient processing of multi-GB files
 * - Line-by-line processing without loading entire files
 * - Production-ready error handling and timeout management
 */
@Injectable()
export class ArchiveZstdDecompressor implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ArchiveZstdDecompressor');
  }

  /**
   * Stream decompress a zstd file and process line by line
   *
   * @param filePath Path to zstd compressed file
   * @param processor Function to process each line
   * @param options Processing options
   */
  async streamDecompressFile<T>(
    filePath: string,
    processor: (data: T, lineNumber: number) => Promise<void> | void,
    options: {
      validator?: (data: unknown) => data is T;
      timeout?: number;
      maxLines?: number;
    } = {},
  ): Promise<{
    totalLines: number;
    validLines: number;
    errorLines: number;
    processingTime: number;
    memoryUsage: { initial: number; peak: number; final: number };
  }> {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    let peakMemory = initialMemory;
    let totalLines = 0;
    let validLines = 0;
    let errorLines = 0;

    this.logger.info('Starting system zstd streaming decompression', {
      filePath,
      timeout: options.timeout || 60000,
      maxLines: options.maxLines,
    });

    return new Promise((resolve, reject) => {
      // F453: a truncated .zst used to resolve SUCCESS with partial counts.
      // The readline 'close' fired when stdout ended and resolved the promise
      // BEFORE the process 'exit' (non-zero, from the truncation) could
      // reject — the exit's reject then no-op'd on an already-settled promise.
      // Resolution is now GATED on the process exiting cleanly: we settle only
      // once BOTH readline has closed AND the process has exited 0 (or was
      // intentionally SIGTERM-killed by our own maxLines/timeout stop).
      let readlineClosed = false;
      let processExitedOk = false;
      let intentionalStop = false; // our own maxLines/timeout kill, not a fault
      let settled = false;

      // Spawn zstd decompression process
      const zstdProcess = spawn('zstd', ['-dc', filePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const settleReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      const maybeResolve = (): void => {
        if (settled) return;
        if (!readlineClosed || !processExitedOk) return;
        settled = true;
        clearTimeout(timeout);
        const finalMemory = process.memoryUsage().heapUsed;
        const processingTime = Date.now() - startTime;

        this.logger.info('Streaming decompression completed', {
          filePath,
          totalLines,
          validLines,
          errorLines,
          processingTime,
          memoryUsage: {
            initial: Math.round(initialMemory / 1024 / 1024),
            peak: Math.round(peakMemory / 1024 / 1024),
            final: Math.round(finalMemory / 1024 / 1024),
          },
        });

        resolve({
          totalLines,
          validLines,
          errorLines,
          processingTime,
          memoryUsage: {
            initial: initialMemory,
            peak: peakMemory,
            final: finalMemory,
          },
        });
      };

      // Handle process errors
      zstdProcess.on('error', (error) => {
        this.logger.error('Zstd process error', error, { filePath });
        settleReject(
          new Error(`Failed to start zstd process: ${error.message}`),
        );
      });

      zstdProcess.stderr.on('data', (data) => {
        /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        // Reason: Node.js child process stream data is Buffer with safe toString() method
        this.logger.warn('Zstd stderr', {
          filePath,
          stderr: data.toString().trim(),
        });
        /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      });

      // Create readline interface for line-by-line processing
      const readline = createInterface({
        input: zstdProcess.stdout,
        crlfDelay: Infinity,
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        this.logger.error('Processing timeout', {
          filePath,
          timeout: options.timeout,
        });
        intentionalStop = true;
        zstdProcess.kill('SIGTERM');
        readline.close();
        settleReject(
          new Error(`Processing timeout after ${options.timeout || 60000}ms`),
        );
      }, options.timeout || 60000);

      // Process each line
      readline.on('line', (line: string) => {
        totalLines++;

        // Track memory usage
        const currentMemory = process.memoryUsage().heapUsed;
        if (currentMemory > peakMemory) {
          peakMemory = currentMemory;
        }

        // Skip empty lines
        if (!line.trim()) {
          return;
        }

        // Check max lines limit
        if (options.maxLines && totalLines > options.maxLines) {
          this.logger.info('Max lines reached, stopping processing', {
            filePath,
            totalLines,
            maxLines: options.maxLines,
          });
          // Our own deliberate stop — the SIGTERM below is not a fault, so the
          // subsequent non-zero/SIGTERM exit must still resolve success.
          intentionalStop = true;
          zstdProcess.kill('SIGTERM');
          readline.close();
          return;
        }

        try {
          // Parse JSON
          // Reason: JSON.parse returns unknown, type validation happens later
          /* eslint-disable @typescript-eslint/no-unsafe-assignment */
          const data = JSON.parse(line);
          /* eslint-enable @typescript-eslint/no-unsafe-assignment */

          // Validate if validator provided
          const isValid = options.validator ? options.validator(data) : true;

          if (isValid) {
            validLines++;
            // Handle both sync and async processors
            const result = processor(data as T, totalLines);
            if (result instanceof Promise) {
              result.catch((error) => {
                errorLines++;
                this.logger.debug('Processor error', {
                  lineNumber: totalLines,
                  error:
                    error instanceof Error
                      ? {
                          message: error.message,
                          stack: error.stack,
                          name: error.name,
                        }
                      : { message: String(error) },
                });
              });
            }
          } else {
            errorLines++;
            this.logger.debug('Line failed validation', {
              lineNumber: totalLines,
              line: line.substring(0, 100),
            });
          }
        } catch (error) {
          errorLines++;
          this.logger.debug('JSON parse error', {
            lineNumber: totalLines,
            error: {
              message: error instanceof Error ? error.message : String(error),
              ...(error instanceof Error && {
                stack: error.stack,
                name: error.name,
              }),
            },
            line: line.substring(0, 100),
          });
        }
      });

      // Handle readline completion — no longer resolves on its own; the
      // process must first be confirmed to have exited cleanly (F453).
      readline.on('close', () => {
        readlineClosed = true;
        maybeResolve();
      });

      // Handle readline errors
      readline.on('error', (error) => {
        this.logger.error('Readline error', error, { filePath });
        zstdProcess.kill('SIGTERM');
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        settleReject(new Error(`Readline error: ${errorMessage}`));
      });

      // Handle process exit — this is now AUTHORITATIVE for success. A clean
      // exit (code 0) or our own intentional SIGTERM stop (maxLines) permits
      // resolution; any other exit (a truncated stream makes zstd exit
      // non-zero) rejects, so partial output can never masquerade as success.
      zstdProcess.on('exit', (code, signal) => {
        if (code === 0 || (signal === 'SIGTERM' && intentionalStop)) {
          processExitedOk = true;
          maybeResolve();
          return;
        }
        this.logger.error('Zstd process exited with error', {
          filePath,
          code,
          signal,
        });
        settleReject(
          new Error(`Zstd process exited with code ${code}, signal ${signal}`),
        );
      });
    });
  }

  /**
   * Validate that system zstd is available
   */
  async validateSystemZstd(): Promise<{
    available: boolean;
    version?: string;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const testProcess = spawn('zstd', ['--version'], { stdio: 'pipe' });

      let output = '';
      testProcess.stdout.on('data', (data) => {
        /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        // Reason: Node.js child process stream data is Buffer with safe toString() method
        output += data.toString();
        /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          const versionMatch = output.match(/v(\d+\.\d+\.\d+)/);
          resolve({
            available: true,
            version: versionMatch ? versionMatch[1] : 'unknown',
          });
        } else {
          resolve({
            available: false,
            error: 'zstd binary not found or not executable',
          });
        }
      });

      testProcess.on('error', (error) => {
        resolve({
          available: false,
          error: error.message,
        });
      });
    });
  }
}
