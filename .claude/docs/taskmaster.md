# Task Master Quick Reference for Claude Code

## Essential Daily Commands

### Project Status

```bash
task-master list                    # All tasks overview
task-master next                    # Get next available task
task-master show <id>              # Detailed task view
tm list                            # Short alias version
```

### Task Management

```bash
task-master set-status --id=<id> --status=in-progress
task-master set-status --id=<id> --status=done
task-master set-status --id=<id> --status=blocked
task-master update-subtask --id=<id> --prompt="progress notes"
```

### Task Creation & Modification

```bash
task-master add-task --prompt="description" --research
task-master expand --id=<id> --research --force
task-master update-task --id=<id> --prompt="changes"
task-master update --from=<id> --prompt="bulk changes"
```

### Analysis & Planning

```bash
task-master analyze-complexity --research
task-master complexity-report
task-master validate-dependencies
task-master fix-dependencies
```

## MCP Tools (Available in Claude Code)

### Core MCP Commands

- `help` - Show all available Task Master MCP tools
- `get_tasks` - List all tasks (same as `task-master list`)
- `next_task` - Get next available task
- `get_task` - Show specific task details
- `set_task_status` - Update task status
- `add_task` - Create new task
- `update_task` - Modify existing task
- `update_subtask` - Add notes to subtask
- `expand_task` - Break task into subtasks
- `analyze_project_complexity` - Analyze task complexity
- `complexity_report` - Show complexity analysis

### Advanced MCP Operations

- `parse_prd` - Generate tasks from PRD document
- `initialize_project` - Set up Task Master in project
- `research` - AI-powered research queries

## Task Status Workflow

### Status Progression

1. `pending` → `in-progress` → `done`
2. `pending` → `blocked` → `in-progress` → `done`
3. `pending` → `deferred` (postponed)
4. `pending` → `cancelled` (no longer needed)

### Best Practices

- Always mark tasks `in-progress` before starting
- Use `update-subtask` to log progress and learnings
- Mark `done` only when fully complete and tested
- Use `blocked` status with detailed blocker description

## Integration with Claude Code

### Context Loading

- CLAUDE.md is automatically loaded
- Use `task-master show <id>` to pull specific task context
- Task updates serve as implementation logs

### Workflow Integration

```bash
# Start task
task-master next
task-master set-status --id=<id> --status=in-progress

# During development (in Claude Code)
# - Implement code
# - Run tests
# - Log progress

# Complete task
task-master set-status --id=<id> --status=done
```

### Custom Slash Commands

Create in `.claude/commands/`:

**tm-status.md**:

```markdown
Show current Task Master status and next task.

Steps:

1. Run `task-master list` for overview
2. Run `task-master next` for next task
3. Show task details with `task-master show <id>`
```

**tm-log.md**:

```markdown
Log progress to current task: $ARGUMENTS

Steps:

1. Get current in-progress task
2. Run `task-master update-subtask --id=<id> --prompt="$ARGUMENTS"`
```

## Performance Tips

### Efficient Commands

- Use `tm` alias instead of `task-master`
- Batch related operations
- Use `--research` flag for AI-enhanced operations

### Error Handling

```bash
# If tasks.json gets corrupted
task-master generate

# If dependencies are invalid
task-master validate-dependencies
task-master fix-dependencies
```

### Configuration

- Model settings: `task-master models`
- Project config: `.taskmaster/config.json`
- Task data: `.taskmaster/tasks/tasks.json`

---

_Quick reference for efficient Task Master usage in Claude Code development workflows._
