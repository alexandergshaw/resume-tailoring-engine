import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

type RenderInput = {
  templateBuffer?: Buffer;
  summary: string;
  skills: string[];
  experienceBullets: string[];
  projects: string[];
  education: string;
};

export function renderDocx(input: RenderInput): Buffer {
  if (input.templateBuffer) {
    try {
      const zip = new PizZip(input.templateBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render({
        SUMMARY: input.summary,
        SKILLS: input.skills.join(', '),
        EXPERIENCE_BULLETS: input.experienceBullets.join('\n'),
        PROJECTS: input.projects.join('\n'),
        EDUCATION: input.education,
      });
      return doc.getZip().generate({ type: 'nodebuffer' });
    } catch {
      // fall through to default renderer
    }
  }

  const fallback = [
    'Tailored Resume',
    '',
    `Summary: ${input.summary}`,
    `Skills: ${input.skills.join(', ')}`,
    'Experience:',
    ...input.experienceBullets.map((bullet) => `- ${bullet}`),
    'Projects:',
    ...input.projects.map((project) => `- ${project}`),
    `Education: ${input.education}`,
  ].join('\n');

  return Buffer.from(fallback, 'utf8');
}
