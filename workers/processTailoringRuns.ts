import { listQueuedRuns } from '@/lib/queue';
import { loadSkillTaxonomy } from '@/lib/resume-tailoring/extractSkills';
import { processSingleRun } from '@/lib/resume-tailoring/processRun';

export async function processTailoringRunsOnce(): Promise<number> {
  await loadSkillTaxonomy();
  const queued = await listQueuedRuns(10);

  for (const run of queued) {
    await processSingleRun(run);
  }

  return queued.length;
}

export async function processTailoringRuns(): Promise<void> {
  for (;;) {
    const processed = await processTailoringRunsOnce();
    await new Promise((resolve) => setTimeout(resolve, processed > 0 ? 500 : 2000));
  }
}

if (require.main === module) {
  processTailoringRuns().catch((error) => {
    console.error('Worker crashed', error);
    process.exit(1);
  });
}
