#!/usr/bin/env swift
import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

guard CommandLine.arguments.count >= 2 else {
  fail(
    "Usage: perf-scenario-extract-video-frame.swift <video.mov> <time_seconds> <output.png>"
  )
}

let videoPath = CommandLine.arguments[1]

if CommandLine.arguments.count == 3, CommandLine.arguments[2] == "--duration" {
  let asset = AVAsset(url: URL(fileURLWithPath: videoPath))
  let durationSeconds = CMTimeGetSeconds(asset.duration)
  guard durationSeconds.isFinite, durationSeconds >= 0 else {
    fail("Invalid video duration for \(videoPath)")
  }
  print("{\"durationSeconds\":\(durationSeconds)}")
  exit(0)
}

guard CommandLine.arguments.count == 4 else {
  fail(
    "Usage: perf-scenario-extract-video-frame.swift <video.mov> <time_seconds> <output.png>"
  )
}

guard let seconds = Double(CommandLine.arguments[2]), seconds.isFinite, seconds >= 0 else {
  fail("Invalid frame time: \(CommandLine.arguments[2])")
}
let outputPath = CommandLine.arguments[3]

let asset = AVAsset(url: URL(fileURLWithPath: videoPath))
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let requestedTime = CMTime(seconds: seconds, preferredTimescale: 600)
var actualTime = CMTime.zero
let image: CGImage
do {
  image = try generator.copyCGImage(at: requestedTime, actualTime: &actualTime)
} catch {
  fail("Failed to extract frame at \(seconds)s: \(error)")
}

let outputURL = URL(fileURLWithPath: outputPath)
try? FileManager.default.createDirectory(
  at: outputURL.deletingLastPathComponent(),
  withIntermediateDirectories: true
)
guard
  let destination = CGImageDestinationCreateWithURL(
    outputURL as CFURL,
    UTType.png.identifier as CFString,
    1,
    nil
  )
else {
  fail("Failed to create PNG destination: \(outputPath)")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else {
  fail("Failed to write PNG: \(outputPath)")
}

let actualSeconds = CMTimeGetSeconds(actualTime)
print("{\"requestedTimeSeconds\":\(seconds),\"actualTimeSeconds\":\(actualSeconds)}")
