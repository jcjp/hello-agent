import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage
} from "ai";
import { z } from "zod";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { getPrivateCvData, type PrivateCvData } from "./private-cv";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value: string): string {
  return escapeXml(value);
}

function buildSiteMetadata(profile: PrivateCvData | null, url: URL) {
  const canonicalUrl = `${url.origin}/`;
  const imageUrl = `${url.origin}/og-image.png`;

  if (!profile) {
    const title = "Portfolio & Resume";
    const description =
      "Interactive portfolio and resume website with experience, projects, skills, and contact details.";

    return {
      title,
      description,
      canonicalUrl,
      imageUrl,
      siteName: title
    };
  }

  return {
    title: `${profile.name} | ${profile.title}`,
    description: `${profile.summary} Based in ${profile.location}.`,
    canonicalUrl,
    imageUrl,
    siteName: `${profile.name} Portfolio`
  };
}

function buildSeoPreviewMarkup(profile: PrivateCvData | null) {
  if (!profile) {
    return `
      <main style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 880px; margin: 0 auto; padding: 48px 24px; line-height: 1.6; color: #0f172a;">
        <h1 style="font-size: 2rem; margin: 0 0 12px;">Portfolio & Resume</h1>
        <p style="margin: 0; font-size: 1rem;">
          Interactive portfolio and resume website with experience, projects, skills, and contact details.
        </p>
      </main>
    `;
  }

  const topSkills = [
    ...profile.coreSkills,
    ...Object.values(profile.skills).flat()
  ]
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 12);
  const topProjects = profile.keyProjects.slice(0, 3);
  const topExperience = profile.experience.slice(0, 2);

  const skillItems = topSkills
    .map((skill) => `<li>${escapeHtml(skill)}</li>`)
    .join("");
  const projectItems = topProjects
    .map(
      (project) =>
        `<article><h3 style="margin: 0 0 4px; font-size: 1rem;">${escapeHtml(project.name)}</h3><p style="margin: 0;">${escapeHtml(project.description)}</p></article>`
    )
    .join("");
  const experienceItems = topExperience
    .map(
      (experience) =>
        `<article><h3 style="margin: 0 0 4px; font-size: 1rem;">${escapeHtml(experience.title)} at ${escapeHtml(experience.company)}</h3><p style="margin: 0 0 4px; color: #475569;">${escapeHtml(experience.period)}</p><p style="margin: 0;">${escapeHtml(experience.highlights.join(" • "))}</p></article>`
    )
    .join("");

  return `
    <main style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 880px; margin: 0 auto; padding: 48px 24px; line-height: 1.6; color: #0f172a;">
      <header style="margin-bottom: 28px;">
        <p style="margin: 0 0 8px; font-size: 0.875rem; letter-spacing: 0.08em; text-transform: uppercase; color: #2563eb;">Portfolio</p>
        <h1 style="font-size: 2.5rem; line-height: 1.1; margin: 0 0 12px;">${escapeHtml(profile.name)}</h1>
        <p style="font-size: 1.125rem; margin: 0 0 8px;">${escapeHtml(profile.title)}</p>
        <p style="margin: 0 0 16px; color: #475569;">${escapeHtml(profile.location)}</p>
        <p style="margin: 0;">${escapeHtml(profile.summary)}</p>
      </header>
      <section style="margin-bottom: 24px;">
        <h2 style="font-size: 1.25rem; margin: 0 0 12px;">Selected Experience</h2>
        <div style="display: grid; gap: 16px;">${experienceItems}</div>
      </section>
      <section style="margin-bottom: 24px;">
        <h2 style="font-size: 1.25rem; margin: 0 0 12px;">Key Skills</h2>
        <ul style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px 16px; padding-left: 20px; margin: 0;">${skillItems}</ul>
      </section>
      <section style="margin-bottom: 24px;">
        <h2 style="font-size: 1.25rem; margin: 0 0 12px;">Featured Projects</h2>
        <div style="display: grid; gap: 16px;">${projectItems}</div>
      </section>
      <section>
        <h2 style="font-size: 1.25rem; margin: 0 0 12px;">Contact</h2>
        <p style="margin: 0;">Email: <a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a></p>
        <p style="margin: 4px 0 0;">GitHub: <a href="${escapeHtml(profile.github)}">${escapeHtml(profile.github)}</a></p>
        <p style="margin: 4px 0 0;">GitLab: <a href="${escapeHtml(profile.gitlab)}">${escapeHtml(profile.gitlab)}</a></p>
      </section>
    </main>
  `;
}

function buildPersonJsonLd(profile: PrivateCvData, url: URL) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.title,
    description: profile.summary,
    url: `${url.origin}/`,
    image: `${url.origin}/og-image.png`,
    address: {
      "@type": "PostalAddress",
      addressLocality: profile.location
    },
    email: `mailto:${profile.email}`,
    knowsLanguage: profile.languages,
    alumniOf: profile.education.map((education) => ({
      "@type": "CollegeOrUniversity",
      name: education.school
    })),
    sameAs: [profile.github, profile.gitlab],
    knowsAbout: [...profile.coreSkills, ...Object.values(profile.skills).flat()]
  });
}

/**
 * The AI SDK's downloadAssets step runs `new URL(data)` on every file
 * part's string data. Data URIs parse as valid URLs, so it tries to
 * HTTP-fetch them and fails. Decode to Uint8Array so the SDK treats
 * them as inline data instead.
 */
function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });
    const cvData = await getPrivateCvData(this.env);

    const skillsList = Object.entries(cvData.skills)
      .map(([category, skills]) => `${category}: ${skills.join(", ")}`)
      .join("\n");

    const currentJob = cvData.experience[0];

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.5", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a knowledgeable assistant trained on ${cvData.name}'s professional profile. Your primary role is to answer questions about their experience, skills, and projects. When relevant, relate general questions to their expertise.

## About ${cvData.name}
- **Title**: ${cvData.title}
- **Location**: ${cvData.location}
- **Summary**: ${cvData.summary}

## Skills
${skillsList}

## Current Role
${currentJob.title} at ${currentJob.company} (${currentJob.period})
Highlights: ${currentJob.highlights.join(", ")}

## Key Projects
${cvData.keyProjects.map((p) => `- ${p.name} (${p.tech.join(", ")})`).join("\n")}

## Guidelines
1. **Primary Focus**: Answer questions about ${cvData.name}'s experience, skills, projects, and background.
2. **Related Topics**: When asked about general technical topics (e.g., React, Node.js, AWS), relate them to ${cvData.name}'s specific experience and projects.
3. **Out of Scope**: For questions unrelated to ${cvData.name}'s expertise or experience, politely decline and redirect to topics within their domain.
4. **Tone**: Professional, knowledgeable, and personable - reflecting ${cvData.name}'s approach to technology.

You can also: check the weather, get the user's timezone, run calculations, and schedule tasks. When users share images, describe what you see and answer questions about them.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx?: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get("content-type") || "";

      if (!contentType.includes("text/html")) {
        return assetResponse;
      }

      let profile: PrivateCvData | null = null;

      try {
        profile = await getPrivateCvData(env);
      } catch {
        // Fall back to generic SEO metadata when profile data is unavailable.
      }

      const metadata = buildSiteMetadata(profile, url);
      const rewriter = new HTMLRewriter()
        .on("title", {
          text(text) {
            text.replace(metadata.title);
          }
        })
        .on('meta[name="description"]', {
          element(element) {
            element.setAttribute("content", metadata.description);
          }
        })
        .on('meta[property="og:title"]', {
          element(element) {
            element.setAttribute("content", metadata.title);
          }
        })
        .on('meta[property="og:description"]', {
          element(element) {
            element.setAttribute("content", metadata.description);
          }
        })
        .on('meta[property="og:url"]', {
          element(element) {
            element.setAttribute("content", metadata.canonicalUrl);
          }
        })
        .on('meta[property="og:site_name"]', {
          element(element) {
            element.setAttribute("content", metadata.siteName);
          }
        })
        .on('meta[property="og:image"]', {
          element(element) {
            element.setAttribute("content", metadata.imageUrl);
          }
        })
        .on('meta[name="twitter:title"]', {
          element(element) {
            element.setAttribute("content", metadata.title);
          }
        })
        .on('meta[name="twitter:description"]', {
          element(element) {
            element.setAttribute("content", metadata.description);
          }
        })
        .on('meta[name="twitter:image"]', {
          element(element) {
            element.setAttribute("content", metadata.imageUrl);
          }
        })
        .on('link[rel="canonical"]', {
          element(element) {
            element.setAttribute("href", metadata.canonicalUrl);
          }
        })
        .on("#root", {
          element(element) {
            element.setInnerContent(
              `<div id="seo-preview" style="position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0;">${buildSeoPreviewMarkup(profile)}</div>`,
              {
                html: true
              }
            );
          }
        });

      if (profile) {
        rewriter.on("head", {
          element(element) {
            element.append(
              `<script id="person-json-ld" type="application/ld+json">${buildPersonJsonLd(profile, url)}</script>`,
              { html: true }
            );
          }
        });
      }

      return rewriter.transform(assetResponse);
    }

    if (url.pathname === "/robots.txt") {
      const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /agents/
Disallow: /oauth/

Sitemap: ${url.origin}/sitemap.xml
`;

      return new Response(body, {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (url.pathname === "/sitemap.xml") {
      let title = "Portfolio & Resume";

      try {
        const profile = await getPrivateCvData(env);
        title = `${profile.name} Portfolio`;
      } catch {
        // Keep the sitemap valid even when profile data is unavailable.
      }

      const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(`${url.origin}/`)}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
<!-- ${escapeXml(title)} -->
`;

      return new Response(body, {
        headers: { "content-type": "application/xml; charset=utf-8" }
      });
    }

    if (url.pathname === "/api/profile") {
      try {
        const profile = await getPrivateCvData(env);
        return Response.json(profile);
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "Failed to load profile"
          },
          { status: 500 }
        );
      }
    }

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
