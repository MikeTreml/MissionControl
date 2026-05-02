# Babysitter Process Methodologies

This directory contains process workflows and methodologies for the Babysitter SDK orchestration framework.

## Quick Links

- **[GSD Workflows](README.md)** - Get Shit Done methodology adapted for Babysitter SDK
- **[Spec-Kit Workflows](SPEC-KIT.md)** - GitHub Spec-Kit inspired spec-driven development
- **[TDD Quality Convergence](methodologies\atdd-tdd\workflows\tdd-quality-convergence.md)** - Test-driven development with quality gates

## Available Methodologies

### Spec-Driven Development (Spec-Kit)

**Based on:** [GitHub Spec-Kit](https://github.com/github/spec-kit)

Executable specifications that drive implementation through systematic phases:

1. **[methodologies\spec-driven-development.js](methodologies\spec-driven-development.js)** - Complete 5-step workflow
   - Constitution â†’ Specification â†’ Plan â†’ Tasks â†’ Implementation
   - Full quality gates and validation

2. **[methodologies\spec-kit-constitution.js](methodologies\spec-kit-constitution.js)** - Standalone constitution
   - Establish governance principles
   - Code quality, UX, performance, security standards

3. **[methodologies\spec-kit-quality-checklist.js](methodologies\spec-kit-quality-checklist.js)** - Quality validation
   - "Unit tests for English"
   - Custom checklists per artifact type

4. **[methodologies\spec-kit-brownfield.js](methodologies\spec-kit-brownfield.js)** - Brownfield development
   - Add features to existing systems
   - Integration analysis and risk validation

**Examples:** [examples/spec-kit-examples.json](examples/spec-kit-examples.json)

---

### Get Shit Done (GSD)

**Based on:** [get-shit-done](https://github.com/glittercowboy/get-shit-done)

Systematic project development preventing context degradation:

1. **[methodologies\gsd\workflows\new-project.js](methodologies\gsd\workflows\new-project.js)** - Project initialization
2. **[methodologies\gsd\workflows\discuss-phase.js](methodologies\gsd\workflows\discuss-phase.js)** - Phase discussion
3. **[methodologies\gsd\workflows\plan-phase.js](methodologies\gsd\workflows\plan-phase.js)** - Planning with verification
4. **[methodologies\gsd\workflows\execute-phase.js](methodologies\gsd\workflows\execute-phase.js)** - Parallel execution
5. **[methodologies\gsd\workflows\verify-work.js](methodologies\gsd\workflows\verify-work.js)** - UAT and fixes
6. **[methodologies\gsd\workflows\audit-milestone.js](methodologies\gsd\workflows\audit-milestone.js)** - Milestone audit
7. **[methodologies\gsd\workflows\map-codebase.js](methodologies\gsd\workflows\map-codebase.js)** - Codebase analysis
8. **[methodologies\gsd\workflows\iterative-convergence.js](methodologies\gsd\workflows\iterative-convergence.js)** - Quality convergence

**Documentation:** [README.md](README.md)

---

### Other Methodologies

Located in [methodologies/](methodologies/):

- **[methodologies\devin.js](methodologies\devin.js)** - Plan â†’ Code â†’ Debug â†’ Deploy
- **[methodologies\ralph.js](methodologies\ralph.js)** - Simple persistent iteration loop
- **[methodologies\plan-and-execute.js](methodologies\plan-and-execute.js)** - Detailed planning then execution
- **[methodologies\agile.js](methodologies\agile.js)** - Sprint-based iterative development
- **[methodologies\bottom-up.js](methodologies\bottom-up.js)** - Component-first development
- **[methodologies\top-down.js](methodologies\top-down.js)** - Architecture-first development
- **[methodologies\evolutionary.js](methodologies\evolutionary.js)** - Incremental evolution
- **[methodologies\graph-of-thoughts.js](methodologies\graph-of-thoughts.js)** - Multi-path reasoning
- **[methodologies\adversarial-spec-debates.js](methodologies\adversarial-spec-debates.js)** - Adversarial validation
- **[methodologies\consensus-and-voting-mechanisms.js](methodologies\consensus-and-voting-mechanisms.js)** - Multi-agent consensus
- **[methodologies\state-machine-orchestration.js](methodologies\state-machine-orchestration.js)** - State-based workflows
- **[methodologies\self-assessment.js](methodologies\self-assessment.js)** - Self-validation loops
- **[methodologies\build-realtime-remediation.js](methodologies\build-realtime-remediation.js)** - Real-time error fixing
- **[methodologies\base44.js](methodologies\base44.js)** - Base44 methodology

---

## Usage

### Run a Process

```bash
babysitter run:create \
  --process-id methodologies/spec-driven-development \
  --entry methodologies\spec-driven-development.js#process \
  --inputs inputs.json
```

### Using Examples

```bash
# Use example inputs directly
babysitter run:create \
  --process-id methodologies/spec-kit-constitution \
  --entry methodologies\spec-kit-constitution.js#process \
  --inputs examples/spec-kit-examples.json#constitutionOnly.inputs
```

### Compose Processes

```javascript
import { process as specDriven } from './methodologies\spec-driven-development.js';
import { process as gsdNewProject } from './methodologies\gsd\workflows\new-project.js';

export async function process(inputs, ctx) {
  // Combine methodologies
  const vision = await gsdNewProject(inputs, ctx);
  const implementation = await specDriven({
    ...inputs,
    constitution: vision.constitution,
    requirements: vision.requirements
  }, ctx);

  return { vision, implementation };
}
```

---

## Comparison Matrix

| Methodology | Best For | Quality Gates | Artifacts | Human Approval |
|-------------|----------|---------------|-----------|----------------|
| **Spec-Kit** | Enterprise, governance-heavy | Constitution, checklists | Constitution, Spec, Plan, Tasks | Every phase |
| **GSD** | Complete products | UAT, verification loops | PROJECT.md, ROADMAP.md, Plans | Vision, Plans, UAT |
| **TDD** | Technical features | Test suite | Tests, Implementation | Test design |
| **Devin** | Full features | Debug loops, quality scoring | Plan, Code, Tests | Plan, Deployment |
| **Agile** | Sprint-based teams | Sprint review, retrospective | User stories, Sprint artifacts | Sprint planning |

---

## Contributing

When adding new methodologies:

1. Place in `methodologies/` directory
2. Follow naming convention: `methodology-name.js`
3. Use `defineTask` from `@a5c-ai/babysitter-sdk`
4. Include JSDoc with `@process`, `@description`, `@inputs`, `@outputs`
5. Add examples to `examples/` directory
6. Update this README

---

## Documentation

- **[SPEC-KIT.md](SPEC-KIT.md)** - Complete Spec-Kit documentation
- **[README.md](README.md)** - GSD workflows documentation
- **[methodologies\gsd\QUICK_START.md](methodologies\gsd\QUICK_START.md)** - GSD quick reference
- **[methodologies\gsd\SUMMARY.md](methodologies\gsd\SUMMARY.md)** - GSD implementation details
- **[methodologies\atdd-tdd\workflows\tdd-quality-convergence.md](methodologies\atdd-tdd\workflows\tdd-quality-convergence.md)** - TDD with convergence

---

## Examples Directory

- **[spec-kit-examples.json](examples/spec-kit-examples.json)** - 8 Spec-Kit examples
- **[gsd/examples/](gsd/examples/)** - GSD workflow examples
- **[methodologies\atdd-tdd\examples\tdd-quality-convergence-example.json](methodologies\atdd-tdd\examples\tdd-quality-convergence-example.json)** - TDD example

---

## License

See repository root LICENSE file.



