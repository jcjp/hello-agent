import { z } from "zod";

const CV_DATA_KEY = "profile";

const cvEntrySchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  description: z.string().optional(),
  year: z.string().optional(),
  id: z.string().optional()
});

const cvDataSchema = z.object({
  name: z.string(),
  title: z.string(),
  location: z.string(),
  phone: z.string().optional(),
  email: z.string(),
  github: z.string(),
  gitlab: z.string(),
  summary: z.string(),
  languages: z.array(z.string()),
  coreSkills: z.array(z.string()),
  skills: z.record(z.string(), z.array(z.string())),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      period: z.string(),
      location: z.string().optional(),
      highlights: z.array(z.string())
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      field: z.string().optional(),
      school: z.string(),
      year: z.string()
    })
  ),
  certifications: z.array(cvEntrySchema),
  trainings: z.array(cvEntrySchema),
  achievements: z.array(
    z.object({
      title: z.string(),
      issuer: z.string().optional(),
      year: z.string(),
      description: z.string().optional()
    })
  ),
  keyProjects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      tech: z.array(z.string())
    })
  )
});

export type PrivateCvData = z.infer<typeof cvDataSchema>;

export async function getPrivateCvData(env: Env): Promise<PrivateCvData> {
  if (!env.PRIVATE_CV) {
    throw new Error(
      "Missing PRIVATE_CV binding. Add a KV binding in wrangler.jsonc and regenerate Worker types."
    );
  }

  const raw = await env.PRIVATE_CV.get(CV_DATA_KEY);
  if (!raw) {
    throw new Error(
      `Missing KV entry "${CV_DATA_KEY}" in PRIVATE_CV. Write your CV JSON with \`wrangler kv key put\` before using the assistant.`
    );
  }

  const parsed = JSON.parse(raw) as unknown;
  return cvDataSchema.parse(parsed);
}
