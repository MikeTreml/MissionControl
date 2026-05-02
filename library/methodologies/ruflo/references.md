# Ruflo References and Attribution

## Primary Source

- **Repository**: [https://github.com/ruvnet/ruflo](https://github.com/ruvnet/ruflo)
- **Author**: ruvnet
- **Description**: Multi-agent orchestration platform for Claude Code with 60+ specialized agents, self-learning architecture, and coordinated swarm execution

## Concepts Adapted

The following Ruflo v3 concepts have been adapted into babysitter process definitions:

### Architecture Layers
- **User Layer** (CLI/MCP entry points) -> `workflows\ruflo-orchestrator.js` (entry process)
- **Routing Layer** (Q-Learning Router, 8 MoE experts) -> `workflows\ruflo-task-routing.js`
- **Swarm Coordination** (topology, consensus) -> `workflows\ruflo-swarm-coordination.js`
- **Agent Execution** (Queen/Worker hierarchy) -> All process files
- **Intelligence Layer** (RuVector, SONA, EWC++) -> `workflows\ruflo-intelligence.js`
- **Security Layer** (AIDefence) -> `workflows\ruflo-security-audit.js`

### Agent Hierarchy
- **Strategic Queen**: Long-term planning -> `agents/strategic-queen/`
- **Tactical Queen**: Execution coordination -> `agents/tactical-queen/`
- **Adaptive Queen**: Real-time optimization -> `agents/adaptive-queen/`
- **Swarm Coordinator**: Topology management -> `agents/swarm-coordinator/`
- **Coder**: Implementation specialist -> `agents/coder/`
- **Tester**: Test creation and execution -> `agents/tester/`
- **Reviewer**: Code quality analysis -> `agents/reviewer/`
- **Architect**: System design -> `agents/architect/`
- **Security Auditor**: Vulnerability detection -> `agents/security-auditor/`
- **Optimizer**: Performance tuning -> `agents/optimizer/`

### Smart Routing
- **Q-Learning Router**: Multi-armed bandit for tier selection -> `workflows\ruflo-task-routing.js`
- **Agent Booster**: WASM fast-path (<1ms, $0, 352x faster) -> `workflows\ruflo-task-routing.js`
- **MoE Experts**: 8 Mixture-of-Experts with gating -> `workflows\ruflo-task-routing.js`
- **Tier System**: Simple/Medium/Complex routing -> `workflows\ruflo-task-routing.js`

### Swarm Coordination
- **Topologies**: Mesh, Hierarchical, Ring, Star -> `workflows\ruflo-swarm-coordination.js`
- **Consensus**: Raft, Byzantine, Gossip, CRDT -> `workflows\ruflo-swarm-coordination.js`
- **Anti-Drift**: Checkpoints, shared memory, role specialization -> `workflows\ruflo-swarm-coordination.js`
- **Weighted Voting**: Queen=3x weight -> `workflows\ruflo-swarm-coordination.js`

### RuVector Intelligence
- **SONA**: Self-Optimizing Neural Architecture -> `workflows\ruflo-intelligence.js`
- **EWC++**: Elastic Weight Consolidation -> `workflows\ruflo-intelligence.js`
- **ReasoningBank**: RETRIEVE->JUDGE->DISTILL pipeline -> `workflows\ruflo-intelligence.js`
- **HNSW**: Vector search (61us, 16400 QPS) -> `workflows\ruflo-intelligence.js`
- **Knowledge Graph**: PageRank, community detection -> `workflows\ruflo-intelligence.js`
- **3-Tier Memory**: Project/Local/User scopes -> `workflows\ruflo-intelligence.js`
- **RL Algorithms**: Q-Learning, SARSA, PPO, DQN, etc. -> `workflows\ruflo-intelligence.js`

### Security (AIDefence)
- **Prompt Injection Blocking**: Pattern + heuristic -> `workflows\ruflo-security-audit.js`
- **Input Validation**: Path traversal prevention -> `workflows\ruflo-security-audit.js`
- **Sandboxed Execution**: Resource-limited isolation -> `workflows\ruflo-security-audit.js`
- **Output Sanitization**: Secret/PII redaction -> `workflows\ruflo-security-audit.js`
- **STRIDE Threat Modeling**: Attack surface analysis -> `workflows\ruflo-security-audit.js`

### Background Workers (12)
- ultralearn, audit, optimize, memory, cache, validation, etc.
- Mapped to SONA adaptation and memory consolidation tasks in `workflows\ruflo-intelligence.js`

## Acknowledgment

This adaptation brings Ruflo v3's multi-agent swarm orchestration, self-learning architecture, and intelligent routing patterns into the babysitter process framework. All credit for the original concepts, terminology, agent hierarchy design, consensus mechanisms, RuVector intelligence architecture, and AIDefence security patterns belongs to ruvnet and the Ruflo project contributors.


