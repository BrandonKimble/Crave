# Development Workflow for Claude Code + Task Master

## Daily Development Ritual

### Morning Startup

```bash
# 1. Check current status
task-master list

# 2. Get next task
task-master next

# 3. Set task in progress
task-master set-status --id=<task-id> --status=in-progress

# 4. Review task details
task-master show <task-id>
```

### Active Development Loop

```bash
# 1. Plan implementation
task-master update-subtask --id=<task-id> --prompt="Implementation plan: [detailed approach]"

# 2. Code implementation
# [Use Claude Code for actual coding]

# 3. Log progress
task-master update-subtask --id=<task-id> --prompt="Progress: [what's working, what's not]"

# 4. Complete task
task-master set-status --id=<task-id> --status=done
```

### End of Day Cleanup

```bash
# 1. Update any incomplete tasks
task-master update-subtask --id=<task-id> --prompt="End of day status: [current state, next steps]"

# 2. Plan tomorrow's work
task-master next

# 3. Generate updated task files
task-master generate
```

## Task Management Patterns

### Breaking Down Complex Tasks

```bash
# 1. Analyze complexity
task-master analyze-complexity --research --threshold=5

# 2. Expand complex tasks
task-master expand --id=<task-id> --research --force

# 3. Validate dependencies
task-master validate-dependencies
```

### Handling Blockers

```bash
# 1. Mark as blocked
task-master set-status --id=<task-id> --status=blocked

# 2. Add blocker context
task-master update-task --id=<task-id> --prompt="Blocked by: [specific issue]"

# 3. Find alternative tasks
task-master next
```

### Research and Learning

```bash
# 1. Research technical questions
task-master research "specific technical question" --save-file=research-notes.md

# 2. Update task with findings
task-master update-subtask --id=<task-id> --prompt="Research findings: [insights]"
```

## Claude Code Integration

### Context Management

- Use `/clear` between major context switches
- Keep CLAUDE.md updated with project insights
- Use task-master show to pull specific context

### Custom Commands

Create `.claude/commands/` directory with workflow shortcuts:

- `tm-next.md` - Get and show next task
- `tm-complete.md` - Complete current task
- `tm-research.md` - Research technical questions

### Quality Assurance

```bash
# Before marking tasks complete
turbo run lint          # Code quality
turbo run type-check    # Type safety
turbo run test          # Test coverage
```

## Performance Optimization

### Efficient Task Updates

- Use descriptive, searchable task update prompts
- Include code snippets and error messages in updates
- Reference file paths and line numbers

### Batch Operations

```bash
# Update multiple related tasks
task-master update --from=<task-id> --prompt="Global change: [description]"

# Expand multiple tasks
task-master expand --all --research
```

### Monitoring Progress

```bash
# Weekly progress review
task-master list --status=done --with-subtasks
task-master complexity-report
```

---

_This workflow optimizes development velocity using Task Master's project management capabilities with Claude Code's AI-powered development assistance._
