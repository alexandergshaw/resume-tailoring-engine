const TAXONOMY: Record<string, string[]> = {
  React: ['react', 'reactjs', 'react.js'],
  'Spring Boot': ['spring boot', 'springboot'],
  AWS: ['aws', 'amazon web services'],
  Docker: ['docker', 'containerization'],
  Kafka: ['kafka', 'apache kafka'],
  TypeScript: ['typescript', 'ts'],
  JavaScript: ['javascript', 'js'],
  Python: ['python'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  PostgreSQL: ['postgres', 'postgresql'],
};

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(TAXONOMY)
    .filter(([, aliases]) => aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(lower)))
    .map(([canonical]) => canonical);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
