# Gas Town References and Attribution

## Primary Source

- **Repository**: [https://github.com/steveyegge/gastown](https://github.com/steveyegge/gastown)
- **Author**: Steve Yegge
- **Description**: Multi-agent orchestration framework for AI-driven software development

## Concepts Adapted

The following Gas Town concepts have been adapted into babysitter process definitions:

### Infrastructure Roles
- **Mayor**: Global coordinator -> `workflows\gastown-orchestrator.js`
- **Deacon**: Daemon supervisor -> `workflows\gastown-patrol.js`
- **Witness**: Per-rig lifecycle manager -> `workflows\gastown-patrol.js` (integrated)
- **Refinery**: Merge queue processor -> `workflows\gastown-merge-queue.js`
- **Boot (Dog)**: Deacon watcher -> `workflows\gastown-patrol.js` (integrated)

### Worker Roles
- **Crew**: Long-lived persistent agents -> `agents/crew-lead/`
- **Polecats**: Transient workers -> `agents/polecat/`
- **Dogs**: Infrastructure helpers -> integrated into Deacon patrol

### Work Units
- **Bead**: Git-backed atomic work unit -> `workflows\gastown-convoy.js`
- **Formula**: TOML-based workflow template -> `workflows\gastown-molecule.js`
- **Protomolecule**: Frozen template -> `workflows\gastown-molecule.js`
- **Molecule**: Active durable workflow -> `workflows\gastown-molecule.js`
- **Wisp**: Ephemeral bead -> `workflows\gastown-convoy.js`
- **Hook**: Agent work queue -> integrated across all processes
- **Convoy**: Primary work order -> `workflows\gastown-convoy.js`
- **MEOW**: Molecular Expression of Work -> `workflows\gastown-orchestrator.js`

### Core Principles
- **GUPP**: Gas Town Universal Propulsion Principle
- **NDI**: Nondeterministic Idempotence
- **Three-tier hooks**: Base -> Role -> Rig+Role hierarchy

### Key Commands (mapped to process steps)
- `gt convoy create` -> gastown-convoy create-beads task
- `gt convoy status` -> gastown-convoy track-progress task
- `gt agents` -> gastown-orchestrator assign-workers task
- `gt feed` -> agent-coordination skill (hook feeding)
- `gt handoff` -> session-management skill (handoff)
- `gt patrol` -> gastown-patrol process
- `gt done` -> gastown-convoy land-convoy task
- `gt nudge` -> gastown-orchestrator handle-escalation task
- `gt seance` -> session-management skill (revival)
- `gt prime` -> session-management skill (context priming)

## Acknowledgment

This adaptation brings Gas Town's multi-agent orchestration patterns into the babysitter process framework. All credit for the original concepts, terminology, and design philosophy belongs to Steve Yegge and the Gas Town project contributors.


