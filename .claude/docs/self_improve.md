# Self-Improvement Workflow for Claude Code + Task Master

## Continuous Learning Loop

### 1. Task Execution Learning

```bash
# After completing each task
task-master update-subtask --id=<task-id> --prompt="
What I learned:
- [Technical insights]
- [Process improvements]
- [Best practices discovered]

What could be improved:
- [Areas for optimization]
- [Faster approaches]
- [Better patterns]
"
```

### 2. Pattern Recognition

- Track recurring issues in task updates
- Identify common bottlenecks in development workflow
- Note successful strategies for reuse

### 3. Workflow Optimization

```bash
# Regular workflow analysis
task-master analyze-complexity --research
task-master complexity-report

# Review and improve task breakdown
task-master expand --all --research --force
```

### 4. Documentation Enhancement

- Update CLAUDE.md with new insights
- Create custom slash commands for frequent patterns
- Maintain dev_workflow.md with proven processes

### 5. Knowledge Validation

- Test new approaches on smaller tasks first
- Validate improvements through task completion metrics
- Use task-master research for technical verification

## Implementation Strategy

### Weekly Review Process

1. `task-master list --status=done` - Review completed tasks
2. Extract patterns from task updates and subtask notes
3. Update workflow documentation
4. Create new slash commands for repetitive workflows
5. Refine task breakdown strategies

### Continuous Integration

- Use task updates as learning logs
- Apply insights to future task planning
- Iterate on development processes based on evidence

---

_This file guides continuous improvement of development workflows using Task Master's tracking capabilities and Claude Code's context management._
