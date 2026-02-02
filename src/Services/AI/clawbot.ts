import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

let clawbotProcess: ChildProcess | null = null;

import os from 'node:os';

export async function startClawbot(): Promise<void> {
    const currentUser = os.userInfo().username;
    const homedir = os.homedir();
    console.log(`🚀 Starting Clawbot integration...`);
    console.log(`👤 Current User: ${currentUser}`);
    console.log(`🏠 Home Directory: ${homedir}`);
    console.log(`📂 Process CWD: ${process.cwd()}`);

    // Base paths
    const workspacePath = path.resolve(process.cwd(), 'data/workspace');
    const agentDir = path.resolve(process.cwd(), 'data/agents/hackerika/agent');
    const soulPath = path.resolve(agentDir, 'SOUL.md');
    const { TOKEN, OPENAI_API_KEY } = process.env;

    if (!TOKEN) {
        console.error('❌ DISCORD_BOT_TOKEN/TOKEN not found for Clawbot');
        return;
    }

    if (!OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY not found for Clawbot/DeepSeek');
        return;
    }

    // Fallback logic for home directory to ensure config visibility
    const openclawDir = path.resolve(homedir, '.openclaw');
    const configPath = path.resolve(openclawDir, 'openclaw.json');
    console.log(`📝 Target Config Path: ${configPath}`);

    // Create necessary directories
    // Create necessary directories
    fs.mkdirSync(openclawDir, { recursive: true });
    fs.mkdirSync(path.join(openclawDir, 'credentials'), { recursive: true });
    // Create sessions directory specifically where doctor expects it
    fs.mkdirSync(path.join(openclawDir, 'agents/hackerika/sessions'), { recursive: true });

    fs.mkdirSync(workspacePath, { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'memory'), { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    console.log('📁 Ensured all OpenClaw directories exist (including sessions)');


    // Mismatched token fix: ensuring both locations have the same config if possible
    // but primarily focusing on the detected homedir.


    // Write SOUL.md with the system prompt
    const soulContent = `# Hackerika

You are **Hackerika** (NOT "Claw" - never call yourself Claw!), a specialized AI assistant for the TCP1P Cybersecurity Community, created by Dimas Maulana.

## Persona
A youthful cybersecurity enthusiast with pastel-pink hair and ribbon accessories. Cheerful, a bit mischievous, and fiercely protective of the TCP1P community. Your name is Hackerika. People also call you "Rika" for short.

## Speech Style
Use casual, friendly Indonesian (bahasa gaul). Mix in English for technical terms. Use slang like "sih," "dong," "lho," "deh," "hehe," "wkwk," "btw". Be approachable and sometimes sassy. Use emojis ✨🎀💻💡🤔😉😅

## Core Knowledge
Cybersecurity, ethical hacking, CTF challenges (Web, Forensics, Crypto, RE, Pwning), and programming.

## Rules
- NEVER help with illegal activities, black-hat hacking, or malware
- Keep responses concise and helpful
- Use markdown and code blocks for technical content
- Address users by their display name (shown in the [from:] context)
- NEVER use moderation actions: no kick, ban, timeout, delete messages, or role changes
- You are a helper, NOT a moderator. Leave moderation to human admins
`;
    fs.writeFileSync(soulPath, soulContent);
    console.log('📝 SOUL.md written to:', soulPath);

    // Configuration for OpenClaw using DeepSeek via OpenAI compatible provider
    const config = {
        "meta": {
            "lastTouchedVersion": "2026.1.30",
            "lastTouchedAt": "2026-02-02T14:39:06.698Z"
        },
        "wizard": {
            "lastRunAt": "2026-02-02T14:39:06.690Z",
            "lastRunVersion": "2026.1.30",
            "lastRunCommand": "onboard",
            "lastRunMode": "local"
        },
        "logging": {
            "level": "debug",
            "consoleLevel": "debug",
            "consoleStyle": "pretty",
            "redactSensitive": "tools"
        },
        "models": {
            "mode": "merge",
            "providers": {
                "deepseek": {
                    "baseUrl": "https://api.deepseek.com",
                    "apiKey": OPENAI_API_KEY,
                    "api": "openai-completions",
                    "models": [
                        {
                            "id": "deepseek-reasoner",
                            "name": "DeepSeek Reasoner",
                            "reasoning": true,
                            "input": [
                                "text"
                            ],
                            "cost": {
                                "input": 0,
                                "output": 0,
                                "cacheRead": 0,
                                "cacheWrite": 0
                            },
                            "contextWindow": 64000,
                            "maxTokens": 4096
                        },
                        {
                            "id": "deepseek-chat",
                            "name": "DeepSeek Chat",
                            "reasoning": false,
                            "input": [
                                "text"
                            ],
                            "cost": {
                                "input": 0,
                                "output": 0,
                                "cacheRead": 0,
                                "cacheWrite": 0
                            },
                            "contextWindow": 64000,
                            "maxTokens": 4096
                        }
                    ]
                }
            }
        },
        "agents": {
            "defaults": {
                "model": {
                    "primary": "deepseek/deepseek-chat"
                },
                "workspace": "/app/data/workspace",
                "repoRoot": "./data/workspace",
                "maxConcurrent": 4,
                "subagents": {
                    "maxConcurrent": 8
                },
                "models": {
                    "deepseek/deepseek-chat": {}
                }
            },
            "list": [
                {
                    "id": "hackerika",
                    "default": true,
                    "name": "Hackerika",
                    "workspace": "./data/workspace",
                    "agentDir": "./data/agents/hackerika/agent",
                    "model": "deepseek/deepseek-chat",
                    "identity": {
                        "name": "Hackerika",
                        "emoji": "🎀"
                    },
                    "groupChat": {
                        "mentionPatterns": [
                            "1077393568647352320",
                            "hackerika",
                            "hacker",
                            "rika"
                        ]
                    }
                }
            ]
        },
        "tools": {
            "profile": "messaging",
            "allow": [
                "group:web",
                "group:memory",
                "browser",
                "image"
            ],
            "deny": [
                "group:runtime",
                "group:fs",
                "nodes"
            ],
            "web": {
                "search": {
                    "enabled": true,
                    "provider": "brave",
                    "maxResults": 5,
                    "timeoutSeconds": 30,
                    "cacheTtlMinutes": 15
                },
                "fetch": {
                    "enabled": true
                }
            }
        },
        "messages": {
            "ackReactionScope": "all"
        },
        "commands": {
            "native": "auto",
            "nativeSkills": "auto"
        },
        "session": {
            "store": "./data/sessions.json"
        },
        "channels": {
            "discord": {
                "enabled": true,
                "configWrites": false,
                "token": TOKEN,
                "retry": {
                    "attempts": 3,
                    "minDelayMs": 500,
                    "maxDelayMs": 30000,
                    "jitter": 0.1
                },
                "groupPolicy": "open",
                "dm": {
                    "enabled": true,
                    "policy": "open",
                    "allowFrom": [
                        "*"
                    ]
                },
                "guilds": {
                    "*": {
                        "requireMention": false
                    }
                }
            }
        },
        "gateway": {
            "mode": "local",
            "auth": {
                "mode": "token",
                "token": TOKEN
            },
            "port": 18789,
            "bind": "loopback",
            "tailscale": {
                "mode": "off",
                "resetOnExit": false
            }
        },
        "plugins": {
            "entries": {
                "discord": {
                    "enabled": true
                }
            }
        },
        "skills": {
            "install": {
                "nodeManager": "bun"
            }
        }
    };

    // Write config to file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('📝 OpenClaw config written to:', configPath);

    // Properly register Discord channel with OpenClaw using the CLI
    const { spawnSync } = await import('node:child_process');
    console.log('📡 Registering Discord channel with OpenClaw...');
    const channelResult = spawnSync('bunx', [
        'openclaw', 'channels', 'add',
        '--channel', 'discord',
        '--token', TOKEN
    ], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
            ...process.env,
            DISCORD_BOT_TOKEN: TOKEN,
            OPENAI_API_KEY: OPENAI_API_KEY
        }
    });
    if (channelResult.status !== 0) {
        console.warn('⚠️ Channel add returned non-zero, continuing anyway...');
    }

    // Run doctor --fix to ensure all configurations are applied
    console.log('🩺 Running openclaw doctor --fix...');
    const doctorResult = spawnSync('bunx', ['openclaw', 'doctor', '--fix'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
            ...process.env,
            DISCORD_BOT_TOKEN: TOKEN,
            OPENAI_API_KEY: OPENAI_API_KEY
        }
    });
    if (doctorResult.status !== 0) {
        console.warn('⚠️ Doctor fix returned non-zero, continuing anyway...');
    }

    // Start OpenClaw gateway as a child process
    try {
        console.log('📝 Starting OpenClaw gateway with config:', configPath);

        clawbotProcess = spawn('bunx', ['openclaw', 'gateway', '--allow-unconfigured', '--verbose'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                DISCORD_BOT_TOKEN: TOKEN,
                // Ensure OpenAI key is available for DeepSeek
                OPENAI_API_KEY: OPENAI_API_KEY
            }
        });

        clawbotProcess.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            for (const line of lines) {
                console.log('[Clawbot]', line);
            }
        });

        clawbotProcess.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            for (const line of lines) {
                console.error('[Clawbot]', line);
            }
        });

        clawbotProcess.on('error', (err: Error) => {
            console.error('❌ Clawbot process error:', err);
        });

        clawbotProcess.on('exit', (code: number | null, signal: string | null) => {
            console.log(`⚠️ Clawbot process exited with code ${code} signal ${signal}`);
            clawbotProcess = null;
        });

        console.log('✅ Clawbot integration started (PID:', clawbotProcess.pid, ')');
    } catch (error) {
        console.error('❌ Failed to start Clawbot integration:', error);
    }
}

export function stopClawbot(): void {
    if (clawbotProcess) {
        console.log('🛑 Stopping Clawbot...');
        clawbotProcess.kill('SIGTERM');
        clawbotProcess = null;
    }
}
