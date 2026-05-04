export type DecisionScoreStep = {
  producesOutput?: boolean;
  usesExternalService?: boolean;
  writesFiles?: boolean;
  modifiesCode?: boolean;
  createsCommit?: boolean;
  hasTests?: boolean;
  destructive?: boolean;
  userFacing?: boolean;
};

export type DecisionScoreInput = {
  steps?: DecisionScoreStep[];
  phases?: Array<{ kind?: string; taskRef?: string }>;
};

export type DecisionScore = {
  scope: number;
  impact: number;
  risk: number;
};

export function computeDecisionScore(input: DecisionScoreInput): DecisionScore {
  const steps = normalizeSteps(input);

  let scope = 50;
  let impact = 50;
  let risk = 30;

  scope += Math.max(steps.length - 3, 0) * 2;

  for (const step of steps) {
    if (step.producesOutput) impact += 10;
    if (step.userFacing) impact += 10;
    if (step.createsCommit) impact += 15;

    if (step.usesExternalService) risk += 15;
    if (step.writesFiles) risk += 10;
    if (step.modifiesCode) risk += 15;
    if (step.destructive) risk += 30;

    if (step.hasTests) risk -= 10;
  }

  return {
    scope: clamp(scope, 0, 95),
    impact: clamp(impact, 0, 95),
    risk: clamp(risk, 0, 90),
  };
}

function normalizeSteps(input: DecisionScoreInput): DecisionScoreStep[] {
  if (input.steps?.length) return input.steps;

  return (input.phases ?? []).map((phase) => {
    const text = `${phase.kind ?? ''} ${phase.taskRef ?? ''}`.toLowerCase();

    return {
      producesOutput: /generate|create|write|build|report|doc/.test(text),
      usesExternalService: /api|fetch|http|download|sync|upload/.test(text),
      writesFiles: /write|save|file|artifact/.test(text),
      modifiesCode: /code|patch|fix|refactor|commit/.test(text),
      createsCommit: /commit|pr|pull request/.test(text),
      hasTests: /test|validate|verify/.test(text),
      destructive: /delete|remove|drop|destroy|overwrite/.test(text),
      userFacing: /ui|report|summary|document|dashboard/.test(text),
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
