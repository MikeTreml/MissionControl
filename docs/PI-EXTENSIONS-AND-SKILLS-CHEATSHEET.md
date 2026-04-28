# Pi Extensions and Skills Cheat Sheet

A quick reference for using **extensions** and **skills** in Pi.

---

## At a Glance

| Feature | Extensions | Skills |
|---|---|---|
| Purpose | Change or extend how Pi works | Give Pi a reusable workflow or procedure |
| Format | TypeScript module | `SKILL.md` plus optional scripts/docs |
| Typical use | Tools, commands, UI, event hooks, integrations | Repeatable task instructions |
| How to use | Load automatically, with `-e`, or via package install | Run with `/skill:name` |

---

## Extensions

### What they are

Extensions are TypeScript modules that can add:

- custom tools
- slash commands
- keyboard shortcuts
- lifecycle hooks
- UI components
- provider or model integrations

Use an extension when you want to **change Pi's behavior**.

### Common extension commands

```bash
pi -e ./my-extension.ts
pi --extension ./my-extension.ts
/reload
pi install <package>
pi remove <package>
pi uninstall <package>
pi list
pi config
```

### What each command does

| Command | Description |
|---|---|
| `pi -e ./my-extension.ts` | Load an extension for the current run |
| `pi --extension ./my-extension.ts` | Same as `-e` |
| `/reload` | Reload extensions, skills, prompts, and context files |
| `pi install <package>` | Install a Pi package that may contain extensions |
| `pi remove <package>` | Remove an installed package |
| `pi uninstall <package>` | Alias for `remove` |
| `pi list` | Show installed Pi packages |
| `pi config` | Enable or disable installed package resources |

### Where Pi discovers extensions

- `~/.pi/agent/extensions/` — global
- `.pi/extensions/` — project-local

### Important note

Extensions do **not** use `/extension:name` commands by default.

Instead, you:

1. load or install the extension
2. use the commands, tools, or UI it registers

### Example

```bash
pi -e ./my-extension.ts
```

---

## Skills

### What they are

Skills are on-demand instruction bundles that teach Pi how to perform a specific workflow.

A skill can include:

- instructions
- setup steps
- scripts
- reference docs

Use a skill when you want Pi to **follow a known process**.

### Skill command format

```bash
/skill:name
/skill:name <arguments>
```

### Examples

```bash
/skill:brave-search
/skill:pdf-tools extract
```

### What happens when you run one

Pi loads the skill's `SKILL.md`, then appends your extra text as:

```text
User: <arguments>
```

### Common skill commands and flags

```bash
/skill:name
/skill:name <arguments>
pi --skill ./path/to/skill
pi --no-skills
/reload
```

| Command / Flag | Description |
|---|---|
| `/skill:name` | Run a skill |
| `/skill:name <arguments>` | Run a skill with arguments |
| `pi --skill ./path/to/skill` | Load a specific skill |
| `pi --no-skills` | Disable automatic skill discovery |
| `/reload` | Reload skills after edits |

### Where Pi discovers skills

- `~/.pi/agent/skills/`
- `~/.agents/skills/`
- `.pi/skills/`
- `.agents/skills/`
- package-provided skill folders
- explicit `--skill <path>` entries

---

## Skills Available in This Environment

### Babysitter skills

| Command | Brief description |
|---|---|
| `/skill:assimilate` | Assimilate an external methodology, harness, or specification into babysitter process definitions, skills, and agents |
| `/skill:babysit` | Orchestrate a run with babysitter |
| `/skill:call` | Start a babysitter run for a complex workflow |
| `/skill:cleanup` | Clean old babysitter run and process data, and aggregate insights |
| `/skill:contrib` | Submit feedback or contribute to the babysitter project |
| `/skill:doctor` | Diagnose babysitter run health and state |
| `/skill:forever` | Start a never-ending babysitter run |
| `/skill:help` | Get babysitter usage help and documentation |
| `/skill:observe` | Launch the babysitter observer dashboard |
| `/skill:plan` | Plan a babysitter run without executing it |
| `/skill:plugins` | Manage babysitter plugins |
| `/skill:project-install` | Set up a project for babysitting |
| `/skill:resume` | Resume a babysitter run |
| `/skill:retrospect` | Analyze a completed run and suggest improvements |
| `/skill:user-install` | Set up babysitter for a user |
| `/skill:yolo` | Start a non-interactive babysitter run |

### Memory skills

| Command | Brief description |
|---|---|
| `/skill:memory-init` | Initialize or reinitialize `pi-memory-md` |
| `/skill:memory-management` | Create, read, update, and delete memory files |
| `/skill:memory-sync` | Sync the memory repository with git |
| `/skill:memory-search` | Search memory files |

---

## Example Usage

### Run a babysitter plan

```bash
/skill:plan Build a workflow for reviewing open feature branches
```

### Diagnose a babysitter issue

```bash
/skill:doctor Run is stuck and not advancing items
```

### Search memory

```bash
/skill:memory-search workflow execution
```

### Load a local extension for testing

```bash
pi -e ./extensions/my-extension.ts
```

---

## Most Useful Everyday Commands

### Skills

```bash
/skill:help
/skill:plan <idea>
/skill:babysit <workflow>
/skill:doctor
/skill:memory-search <query>
```

### Extensions and packages

```bash
pi -e ./my-extension.ts
/reload
pi install <package>
pi remove <package>
pi list
pi config
```

---

## Super Short Version

### Use a skill when

- you want Pi to follow a predefined workflow
- command format is:

```bash
/skill:name
/skill:name <arguments>
```

### Use an extension when

- you want to add or change Pi functionality
- load it with:

```bash
pi -e ./extension.ts
```

or install it with:

```bash
pi install <package>
```
