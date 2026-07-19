import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "./appSidebar"

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider defaultOpen={true}>
            <TooltipProvider delayDuration={0}>
                <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
                    <AppSidebar />

                    <div className="flex flex-1 flex-col overflow-y-auto">
                        <main className="p-6 md:p-8">
                            {children}
                        </main>
                    </div>
                </div>
            </TooltipProvider>
        </SidebarProvider>
    )
}