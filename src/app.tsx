import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { type UIMessage } from "ai";
import type { ChatAgent } from "./server";
import { cvData, examplePrompts } from "./cv-data";
import {
  Badge,
  Button,
  InputArea,
  Surface,
  Text
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";

// ── Small components ──────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllExperience, setShowAllExperience] = useState(false);
  const [showAllCertifications, setShowAllCertifications] = useState(false);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toasts = useKumoToastManager();
  
  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "Scheduled task completed",
              description: data.description,
              timeout: 0
            });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Re-focus the input after streaming ends
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text) || isStreaming) return;
    setInput("");

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    if (text) parts.push({ type: "text", text });

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, sendMessage]);

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated relative">
      {/* Header */}
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-kumo-default">
              <span className="align-super">🪪</span>
            </h1>
            <Badge variant="secondary">
              <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
              AI Chat
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <ThemeToggle />
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="space-y-6">
              {/* User Profile Card */}
              <Surface className="p-6 rounded-xl bg-gradient-to-br from-kumo-base to-kumo-control border border-kumo-line mx-auto w-full">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-kumo-default">
                      {cvData.name}
                    </h2>
                    <p className="text-sm text-kumo-accent font-semibold">
                      {cvData.title}
                    </p>
                    <p className="text-xs text-kumo-inactive mt-1">
                      {cvData.location}
                    </p>

                    {/* Contact Links */}
                    <div className="flex gap-3 text-xs text-kumo-inactive mt-2">
                      <a
                        href={`mailto:${cvData.email}`}
                        className="hover:text-kumo-accent transition"
                      >
                        Email
                      </a>
                      <a
                        href={cvData.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-kumo-accent transition"
                      >
                        GitHub
                      </a>
                      <a
                        href={cvData.gitlab}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-kumo-accent transition"
                      >
                        GitLab
                      </a>
                    </div>
                  </div>

                  <p className="text-sm text-kumo-default leading-relaxed">
                    {cvData.summary}
                  </p>

                  {/* Key Skills */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                        Technical Skills
                      </p>
                      {Object.values(cvData.skills).flat().length > 20 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllSkills(!showAllSkills)}
                          className="text-xs"
                        >
                          {showAllSkills ? "Show Less" : "Show More"}
                        </Button>
                      )}
                    </div>

                    <div
                      className="collapse-content overflow-hidden"
                      style={{
                        maxHeight: showAllSkills ? "2000px" : "300px",
                        opacity: showAllSkills ? 1 : 1
                      }}
                    >
                      {!showAllSkills ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.values(cvData.skills)
                            .flat()
                            .slice(0, 20)
                            .map((skill) => (
                              <Badge
                                key={skill}
                                variant="secondary"
                                className="text-xs"
                              >
                                {skill}
                              </Badge>
                            ))}
                          {Object.values(cvData.skills).flat().length > 20 && (
                            <Badge variant="secondary" className="text-xs">
                              +{Object.values(cvData.skills).flat().length - 20}{" "}
                              more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 text-xs">
                          {Object.entries(cvData.skills).map(
                            ([category, skills]) => (
                              <div key={category}>
                                <p className="font-semibold text-kumo-default capitalize mb-1.5">
                                  {category.replace(/([A-Z])/g, " $1").trim()}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {skills.map((skill) => (
                                    <Badge
                                      key={skill}
                                      variant="primary"
                                      className="text-xs"
                                    >
                                      {skill}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="pt-2 border-t border-kumo-line">
                    <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide mb-2">
                      Languages
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cvData.languages.map((language) => (
                        <Badge
                          key={language}
                          variant="secondary"
                          className="text-xs"
                        >
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Work Experience */}
                  <div className="pt-2 border-t border-kumo-line">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                        Experience
                      </p>
                      {cvData.experience.length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowAllExperience(!showAllExperience)
                          }
                          className="text-xs"
                        >
                          {showAllExperience ? "Show Less" : "Show More"}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {showAllExperience
                        ? cvData.experience.map((exp) => (
                            <div
                              key={exp.company + exp.period}
                              className="text-xs "
                            >
                              <p className="font-semibold text-kumo-default">
                                {exp.title}
                              </p>
                              <p className="text-kumo-accent">{exp.company}</p>
                              <p className="text-kumo-subtle text-xs">
                                {exp.period}
                              </p>
                            </div>
                          ))
                        : cvData.experience.slice(0, 3).map((exp) => (
                            <div
                              key={exp.company + exp.period}
                              className="text-xs"
                            >
                              <p className="font-semibold text-kumo-default">
                                {exp.title}
                              </p>
                              <p className="text-kumo-accent">{exp.company}</p>
                              <p className="text-kumo-subtle text-xs">
                                {exp.period}
                              </p>
                            </div>
                          ))}
                    </div>
                  </div>

                  {/* Education */}
                  <div className="pt-2 border-t border-kumo-line">
                    <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide mb-2">
                      Education
                    </p>
                    <div className="text-xs mb-1.5">
                      <p className="font-semibold text-kumo-default">
                        {cvData.education[0].degree}
                        {cvData.education[0].field &&
                          ` in ${cvData.education[0].field}`}
                      </p>
                      <p className="text-kumo-inactive">
                        {cvData.education[0].school}
                      </p>
                      <p className="text-kumo-subtle">
                        {cvData.education[0].year}
                      </p>
                    </div>
                  </div>

                  {/* Certifications - Highlighted */}
                  <div className="pt-2 border-t border-kumo-line">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                        Certifications
                      </p>
                      {cvData.certifications.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowAllCertifications(!showAllCertifications)
                          }
                          className="text-xs"
                        >
                          {showAllCertifications ? "Show Less" : "Show More"}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {showAllCertifications
                        ? cvData.certifications.map((cert) => (
                            <div
                              key={cert.name}
                              className="p-2 rounded bg-kumo-control border border-kumo-accent "
                            >
                              <p className="text-xs font-semibold text-kumo-default">
                                {cert.name}
                              </p>
                              <p className="text-xs text-kumo-accent">
                                {cert.issuer}
                              </p>
                              {cert.description && (
                                <p className="text-xs text-kumo-subtle mt-1">
                                  {cert.description}
                                </p>
                              )}
                            </div>
                          ))
                        : cvData.certifications.slice(0, 2).map((cert) => (
                            <div
                              key={cert.name}
                              className="p-2 rounded bg-kumo-control border border-kumo-accent"
                            >
                              <p className="text-xs font-semibold text-kumo-default">
                                {cert.name}
                              </p>
                              <p className="text-xs text-kumo-accent">
                                {cert.issuer}
                              </p>
                              {cert.description && (
                                <p className="text-xs text-kumo-subtle mt-1">
                                  {cert.description}
                                </p>
                              )}
                            </div>
                          ))}
                    </div>
                    <p className="text-xs text-kumo-default mt-3">
                      <span className="font-semibold">
                        {cvData.certifications.length}
                      </span>{" "}
                      Total Professional Certifications
                    </p>
                    <p className="text-xs text-kumo-default mt-1">
                      <span className="font-semibold">
                        {cvData.trainings.length}
                      </span>{" "}
                      Online Trainings Completed
                    </p>
                  </div>

                  {/* Achievements */}
                  <div className="pt-2 border-t border-kumo-line">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                        Achievements
                      </p>
                      {cvData.achievements.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowAllAchievements(!showAllAchievements)
                          }
                          className="text-xs"
                        >
                          {showAllAchievements ? "Show Less" : "Show More"}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-kumo-default">
                      <span className="font-semibold">
                        {cvData.achievements.length}
                      </span>{" "}
                      Awards & Honors
                    </p>
                    <div className="mt-2 space-y-1">
                      {showAllAchievements
                        ? cvData.achievements.map((achievement, i) => (
                            <p
                              key={i}
                              className="text-xs text-kumo-default "
                            >
                              <span className="font-semibold">
                                {achievement.title}
                              </span>{" "}
                              ({achievement.year})
                            </p>
                          ))
                        : cvData.achievements.slice(0, 2).map((achievement, i) => (
                            <p
                              key={i}
                              className="text-xs text-kumo-default"
                            >
                              <span className="font-semibold">
                                {achievement.title}
                              </span>{" "}
                              ({achievement.year})
                            </p>
                          ))}
                    </div>
                  </div>

                  {/* Key Projects */}
                  <div className="pt-2 border-t border-kumo-line">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                        Projects
                      </p>
                      {cvData.keyProjects.length > 4 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAllProjects(!showAllProjects)}
                          className="text-xs"
                        >
                          {showAllProjects ? "Show Less" : "Show More"}
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2 text-xs">
                      {showAllProjects
                        ? cvData.keyProjects.map((project) => (
                            <div
                              key={project.name}
                              className="p-2 rounded bg-kumo-control border border-kumo-line "
                            >
                              <p className="font-semibold text-kumo-default">
                                {project.name}
                              </p>
                              <p className="text-kumo-subtle mt-1">
                                {project.tech.join(", ")}
                              </p>
                            </div>
                          ))
                        : cvData.keyProjects.slice(0, 4).map((project) => (
                            <div
                              key={project.name}
                              className="p-2 rounded bg-kumo-control border border-kumo-line"
                            >
                              <p className="font-semibold text-kumo-default">
                                {project.name}
                              </p>
                              <p className="text-kumo-subtle mt-1">
                                {project.tech.join(", ")}
                              </p>
                            </div>
                          ))}
                    </div>
                  </div>
                </div>
              </Surface>

              {/* Example Prompts */}
              <div className="space-y-3 mx-auto w-full">
                <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide text-center">
                  Ask me about my experience
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {examplePrompts.map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      disabled={isStreaming}
                      className="text-left justify-start"
                      onClick={() => {
                        sendMessage({
                          role: "user",
                          parts: [{ type: "text", text: prompt }]
                        });
                      }}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    const text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                            {text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            plugins={{ code }}
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              placeholder={"Send a message..."}
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={!input.trim() || !connected}
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
