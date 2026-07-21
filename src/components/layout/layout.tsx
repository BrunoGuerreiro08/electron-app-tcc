import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "./appSidebar"
import { BreadcrumbTrail } from "./breadcrumbTrail"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <TooltipProvider delayDuration={0}>
                <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
                    <AppSidebar />

                    <div className="flex flex-1 flex-col overflow-y-auto">
                        <div className="flex h-12 shrink-0 items-center border-b border-border/50 px-6 md:px-8">
                            <BreadcrumbTrail />
                        </div>

                        <main className="p-6 md:p-8">
                            {children}
                        </main>
                    </div>
                </div>
            </TooltipProvider>
        </SidebarProvider>
    )
}