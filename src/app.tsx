import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { type UIMessage } from "ai";
import type { ChatAgent } from "./server";
import type { PrivateCvData } from "./private-cv";
import { examplePrompts } from "./example-prompts";
import { Badge, Button, InputArea, Surface, Text } from "@cloudflare/kumo";
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
  SunIcon
} from "@phosphor-icons/react";

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

function AnimatedToggleContent({
  expanded,
  collapsedContent,
  expandedContent
}: {
  expanded: boolean;
  collapsedContent: ReactNode;
  expandedContent: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string>("auto");
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const nextHeight = `${content.getBoundingClientRect().height}px`;

    if (!ready) {
      setHeight(nextHeight);
      setReady(true);
      return;
    }

    const currentHeight = `${container.getBoundingClientRect().height}px`;
    setHeight(currentHeight);

    const frame = requestAnimationFrame(() => {
      setHeight(nextHeight);
    });

    return () => cancelAnimationFrame(frame);
  }, [expanded, collapsedContent, expandedContent, ready]);

  return (
    <div
      ref={containerRef}
      className={`collapse-content overflow-hidden ${ready ? "is-ready" : ""}`}
      style={{ height }}
    >
      <div
        ref={contentRef}
        className={`collapse-inner ${expanded ? "is-expanded" : "is-collapsed"}`}
      >
        {expanded ? expandedContent : collapsedContent}
      </div>
    </div>
  );
}

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState<PrivateCvData | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
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

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
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
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/profile");
        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Failed to load CV";
          throw new Error(message);
        }

        if (!cancelled) {
          setProfile(data as PrivateCvData);
          setProfileError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setProfileError(
            error instanceof Error ? error.message : "Failed to load CV"
          );
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    sendMessage({
      role: "user",
      parts: [{ type: "text", text }]
    });

    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, sendMessage]);

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated relative">
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="space-y-6">
              <Surface className="p-6 rounded-xl bg-gradient-to-br from-kumo-base to-kumo-control border border-kumo-line mx-auto w-full">
                {!profile && !profileError && (
                  <div className="text-sm text-kumo-subtle">Loading CV...</div>
                )}

                {profileError && (
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-kumo-default">
                      CV unavailable
                    </h2>
                    <p className="text-sm text-kumo-danger">{profileError}</p>
                  </div>
                )}

                {profile && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-bold text-kumo-default">
                        {profile.name}
                      </h2>
                      <p className="text-sm text-kumo-accent font-semibold">
                        {profile.title}
                      </p>
                      <p className="text-xs text-kumo-subtle mt-1">
                        {profile.location}
                      </p>

                      <div className="flex gap-3 text-xs text-kumo-subtle mt-2">
                        <a
                          href={`mailto:${profile.email}`}
                          className="hover:text-kumo-accent transition"
                        >
                          Email
                        </a>
                        <a
                          href={profile.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-kumo-accent transition"
                        >
                          GitHub
                        </a>
                        <a
                          href={profile.gitlab}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-kumo-accent transition"
                        >
                          GitLab
                        </a>
                      </div>
                    </div>

                    <p className="text-sm text-kumo-default leading-relaxed">
                      {profile.summary}
                    </p>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                          Technical Skills
                        </p>
                        {Object.values(profile.skills).flat().length > 20 && (
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

                      <AnimatedToggleContent
                        expanded={showAllSkills}
                        collapsedContent={
                          <div className="flex flex-wrap gap-1.5">
                            {Object.values(profile.skills)
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
                            {Object.values(profile.skills).flat().length >
                              20 && (
                              <Badge variant="secondary" className="text-xs">
                                +
                                {Object.values(profile.skills).flat().length -
                                  20}{" "}
                                more
                              </Badge>
                            )}
                          </div>
                        }
                        expandedContent={
                          <div className="space-y-3 text-xs">
                            {Object.entries(profile.skills).map(
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
                        }
                      />
                    </div>

                    <div className="pt-2 border-t border-kumo-line">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide mb-2">
                        Languages
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {profile.languages.map((language) => (
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

                    <div className="pt-2 border-t border-kumo-line">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                          Experience
                        </p>
                        {profile.experience.length > 3 && (
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

                      <AnimatedToggleContent
                        expanded={showAllExperience}
                        collapsedContent={
                          <div className="space-y-2">
                            {profile.experience.slice(0, 3).map((exp) => (
                              <div
                                key={exp.company + exp.period}
                                className="text-xs"
                              >
                                <p className="font-semibold text-kumo-default">
                                  {exp.title}
                                </p>
                                <p className="text-kumo-accent">
                                  {exp.company}
                                </p>
                                <p className="text-kumo-subtle text-xs">
                                  {exp.period}
                                </p>
                              </div>
                            ))}
                          </div>
                        }
                        expandedContent={
                          <div className="space-y-2">
                            {profile.experience.map((exp) => (
                              <div
                                key={exp.company + exp.period}
                                className="text-xs"
                              >
                                <p className="font-semibold text-kumo-default">
                                  {exp.title}
                                </p>
                                <p className="text-kumo-accent">
                                  {exp.company}
                                </p>
                                <p className="text-kumo-subtle text-xs">
                                  {exp.period}
                                </p>
                              </div>
                            ))}
                          </div>
                        }
                      />
                    </div>

                    <div className="pt-2 border-t border-kumo-line">
                      <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide mb-2">
                        Education
                      </p>
                      <div className="text-xs mb-1.5">
                        <p className="font-semibold text-kumo-default">
                          {profile.education[0].degree}
                          {profile.education[0].field &&
                            ` in ${profile.education[0].field}`}
                        </p>
                        <p className="text-kumo-subtle">
                          {profile.education[0].school}
                        </p>
                        <p className="text-kumo-default/80">
                          {profile.education[0].year}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-kumo-line">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                          Certifications
                        </p>
                        {profile.certifications.length > 2 && (
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

                      <AnimatedToggleContent
                        expanded={showAllCertifications}
                        collapsedContent={
                          <div className="space-y-2">
                            {profile.certifications.slice(0, 2).map((cert) => (
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
                        }
                        expandedContent={
                          <div className="space-y-2">
                            {profile.certifications.map((cert) => (
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
                        }
                      />

                      <p className="text-xs text-kumo-default mt-3">
                        <span className="font-semibold">
                          {profile.certifications.length}
                        </span>{" "}
                        Total Professional Certifications
                      </p>
                      <p className="text-xs text-kumo-default mt-1">
                        <span className="font-semibold">
                          {profile.trainings.length}
                        </span>{" "}
                        Online Trainings Completed
                      </p>
                    </div>

                    <div className="pt-2 border-t border-kumo-line">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                          Achievements
                        </p>
                        {profile.achievements.length > 2 && (
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
                          {profile.achievements.length}
                        </span>{" "}
                        Awards & Honors
                      </p>
                      <AnimatedToggleContent
                        expanded={showAllAchievements}
                        collapsedContent={
                          <div className="mt-2 space-y-1">
                            {profile.achievements
                              .slice(0, 2)
                              .map((achievement, i) => (
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
                        }
                        expandedContent={
                          <div className="mt-2 space-y-1">
                            {profile.achievements.map((achievement, i) => (
                              <p key={i} className="text-xs text-kumo-default">
                                <span className="font-semibold">
                                  {achievement.title}
                                </span>{" "}
                                ({achievement.year})
                              </p>
                            ))}
                          </div>
                        }
                      />
                    </div>

                    <div className="pt-2 border-t border-kumo-line">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-kumo-subtle uppercase tracking-wide">
                          Projects
                        </p>
                        {profile.keyProjects.length > 4 && (
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

                      <AnimatedToggleContent
                        expanded={showAllProjects}
                        collapsedContent={
                          <div className="space-y-2 text-xs">
                            {profile.keyProjects.slice(0, 4).map((project) => (
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
                        }
                        expandedContent={
                          <div className="space-y-2 text-xs">
                            {profile.keyProjects.map((project) => (
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
                        }
                      />
                    </div>
                  </div>
                )}
              </Surface>

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
