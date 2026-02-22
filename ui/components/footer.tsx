import { ExternalLink, Github } from "lucide-react"

export function Footer() {
    return (
        <footer className="glass-panel border-t border-border mt-auto">
            <div className="container mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()}{" "}
                        <a
                            href="https://tcp1p.team"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                        >
                            TCP1P
                        </a>
                        . Built for CTF teams worldwide.
                    </div>
                    <div className="flex items-center gap-4">
                        <a
                            href="https://github.com/dimasma0305/ctf-assistant"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Github className="w-4 h-4" />
                            <span className="hidden sm:inline">GitHub</span>
                        </a>
                        <a
                            href="https://ctftime.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            <span className="hidden sm:inline">CTFTime</span>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    )
}
