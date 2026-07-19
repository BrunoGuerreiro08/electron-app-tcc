import { useTheme } from "next-themes"
import { useAuthStore } from "@/store/authStore"
import {
    LogOut,
    Sun,
    Moon,
    Monitor,
    ChevronsLeftRight,
    ChevronRight,
    Hash,
    Printer,
    SlidersHorizontal,
    BookOpen,
    FileText,
    LifeBuoy,
    Shield,
    User
} from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarSeparator,
    useSidebar,
} from "@/components/ui/sidebar"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible"

export function AppSidebar() {
    const { theme, setTheme } = useTheme()
    const { state, toggleSidebar } = useSidebar()
    const logout = useAuthStore((state) => state.logout)
    const isCollapsed = state === "collapsed"

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark')
        else if (theme === 'dark') setTheme('system')
        else setTheme('light')
    }

    // Mock list for Coleções which will tie to DB later
    const mockColecoes = [
        { id: 1, title: "Coleção #1" },
        { id: 2, title: "Coleção #2" },
        { id: 3, title: "Coleção #3" },
    ]

    return (
        <Sidebar collapsible="icon" className="border-r border-border">
            <SidebarHeader className="h-14 flex flex-row items-center justify-between px-4 border-b border-border/50">
                {!isCollapsed && (
                    <div className="flex items-center gap-2 font-semibold">
                        <div className="size-5 rounded bg-primary" />
                        <span className="text-sm">Acme Inc.</span>
                    </div>
                )}

                <SidebarMenuButton
                    onClick={toggleSidebar}
                    size="sm"
                    className="h-8 w-8 p-0 flex items-center justify-center ml-auto"
                    title="Toggle Sidebar (Ctrl+B)"
                >
                    <ChevronsLeftRight className="h-4 w-4" />
                </SidebarMenuButton>
            </SidebarHeader>

            <SidebarContent className="py-2">

                <SidebarGroup>
                    <SidebarGroupLabel className="text-xs font-medium px-3 text-muted-foreground">
                        Menu
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="px-2 space-y-0.5">
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="Dashboard">
                                    <a href="/dashboard" className="flex items-center gap-3">
                                        <Hash className="h-4 w-4 shrink-0" />
                                        <span>Dashboard</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="Exportar">
                                    <a href="/export" className="flex items-center gap-3">
                                        <Printer className="h-4 w-4 shrink-0" />
                                        <span>Exportar</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <Collapsible asChild className="group/collapsible">
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton tooltip="Configurações">
                                            <SlidersHorizontal className="h-4 w-4 shrink-0" />
                                            <span>Configurações</span>
                                            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton asChild>
                                                    <a href="/settings/profile">
                                                        <User className="h-3.5 w-3.5 mr-1" /> Perfil
                                                    </a>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton asChild>
                                                    <a href="/settings/security">
                                                        <Shield className="h-3.5 w-3.5 mr-1" /> Segurança
                                                    </a>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>

                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <Collapsible defaultOpen className="group/collapsible w-full">
                    <SidebarGroup>
                        <CollapsibleTrigger className="flex w-full items-center justify-between pr-4 hover:text-foreground transition-colors group/trigger">
                            <SidebarGroupLabel className="text-xs font-medium px-3 text-muted-foreground cursor-pointer group-hover/trigger:text-foreground">
                                Coleções
                            </SidebarGroupLabel>
                            <ChevronRight className="h-3 w-3 text-muted-foreground/70 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                            <SidebarGroupContent className="px-2 pt-2">
                                <SidebarMenu className="pl-3 ml-2 border-l border-border space-y-0.5">
                                    {mockColecoes.map((colecao) => (
                                        <SidebarMenuItem key={colecao.id}>
                                            <SidebarMenuButton asChild tooltip={colecao.title}>
                                                <a href={`/collections/${colecao.id}`} className="text-sm py-1.5 px-2">
                                                    {colecao.title}
                                                </a>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </CollapsibleContent>
                    </SidebarGroup>
                </Collapsible>

                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu className="px-2">

                            <Collapsible asChild className="group/collapsible">
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton tooltip="Ajuda">
                                            <BookOpen className="h-4 w-4 shrink-0" />
                                            <span>Ajuda</span>
                                            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton asChild>
                                                    <a href="/help/docs">
                                                        <FileText className="h-3.5 w-3.5 mr-1" /> Documentação
                                                    </a>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton asChild>
                                                    <a href="/help/support">
                                                        <LifeBuoy className="h-3.5 w-3.5 mr-1" /> Suporte
                                                    </a>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>

                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

            </SidebarContent>

            <SidebarFooter className="p-2 border-t border-border/50">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={cycleTheme} tooltip="Change Theme">
                            {theme === 'light' && <Sun className="h-4 w-4 shrink-0" />}
                            {theme === 'dark' && <Moon className="h-4 w-4 shrink-0" />}
                            {theme === 'system' && <Monitor className="h-4 w-4 shrink-0" />}
                            <span>
                                {theme === 'light' && 'Light Mode'}
                                {theme === 'dark' && 'Dark Mode'}
                                {theme === 'system' && 'System Theme'}
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <SidebarMenuButton
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive data-[active=true]:bg-transparent"
                                    tooltip="Log out"
                                >
                                    <LogOut className="h-4 w-4 shrink-0" />
                                    <span>Log out</span>
                                </SidebarMenuButton>
                            </AlertDialogTrigger>

                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        You will need to re-verify your institutional email address to gain access next time.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={logout}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Log out
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar >
    )
}