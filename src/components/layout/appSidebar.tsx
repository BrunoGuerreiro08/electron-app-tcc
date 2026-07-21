import { useTheme } from "next-themes"
import { useAuthStore } from "@/store/authStore"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
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
    User,
    Library,
    Home,
    Plus
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ServerStatusIndicator } from "./serverStatusIndicator"
import { useCollectionsStore } from "@/store/collectionsStore"
import { useEffect, useState } from "react"
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AppSidebar() {
    const { theme, setTheme } = useTheme()
    const { state, toggleSidebar } = useSidebar()
    const logout = useAuthStore((state) => state.logout)
    const isCollapsed = state === "collapsed"
    const location = useLocation()

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark')
        else if (theme === 'dark') setTheme('system')
        else setTheme('light')
    }

    const navigate = useNavigate()
    const { collections, load, create } = useCollectionsStore()
    const [newDialogOpen, setNewDialogOpen] = useState(false)
    const [newName, setNewName] = useState('')

    useEffect(() => {
        load()
    }, [load])

    const handleCreate = async () => {
        if (!newName.trim()) return
        const id = await create(newName.trim())
        setNewName('')
        setNewDialogOpen(false)
        navigate(`/collections/${id}`)
    }

    // inside the sidebar component:
    const session = useAuthStore((s) => s.session)

    const displayName = session?.user.name ?? session?.user.email ?? 'Guest'
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')

    return (
        <Sidebar collapsible="icon" className="border-r border-border">
            <SidebarHeader className="h-14 flex flex-row items-center justify-between px-4 border-b border-border/50">
                {!isCollapsed && (
                    <div className="flex items-center gap-2 font-semibold min-w-0">
                        <div className="size-7 rounded bg-primary flex items-center justify-center text-[11px] font-medium text-primary-foreground leading-none">
                            {initials}
                        </div>
                        <span className="text-sm truncate">{displayName}</span>
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
                        <SidebarMenu className="space-y-1">

                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    tooltip="Home"
                                    isActive={location.pathname === "/"}
                                >
                                    <NavLink to="/" className="flex items-center gap-3">
                                        <Home className="h-4 w-4 shrink-0" />
                                        <span>Home</span>
                                    </NavLink>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    tooltip="Dashboard"
                                    isActive={location.pathname === "/dashboard"}
                                >
                                    <NavLink to="/dashboard" className="flex items-center gap-3">
                                        <Hash className="h-4 w-4 shrink-0" />
                                        <span>Dashboard</span>
                                    </NavLink>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    tooltip="Exportar"
                                    isActive={location.pathname === "/export"}
                                >
                                    <NavLink to="/export" className="flex items-center gap-3">
                                        <Printer className="h-4 w-4 shrink-0" />
                                        <span>Exportar</span>
                                    </NavLink>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <Collapsible
                                asChild
                                defaultOpen={location.pathname.startsWith("/settings")}
                                className="group/collapsible"
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton
                                            tooltip="Configurações"
                                            isActive={location.pathname.startsWith("/settings")}
                                        >
                                            <SlidersHorizontal className="h-4 w-4 shrink-0" />
                                            <span>Configurações</span>
                                            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                    asChild
                                                    isActive={location.pathname === "/settings/profile"}
                                                >
                                                    <NavLink to="/settings/profile">
                                                        <User className="h-3.5 w-3.5 mr-1" /> Perfil
                                                    </NavLink>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                    asChild
                                                    isActive={location.pathname === "/settings/security"}
                                                >
                                                    <NavLink to="/settings/security">
                                                        <Shield className="h-3.5 w-3.5 mr-1" /> Segurança
                                                    </NavLink>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>

                            <SidebarSeparator className="my-2 mx-auto w-[calc(100%-1rem)] group-data-[collapsible=icon]:w-8" />
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    tooltip="Documentos"
                                    isActive={location.pathname.startsWith("/documents")}
                                >
                                    <NavLink to="/documents">
                                        <FileText className="h-4 w-4 shrink-0" />
                                        <span>Documentos</span>
                                    </NavLink>
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            <Collapsible
                                asChild
                                defaultOpen={location.pathname.startsWith("/collections")}
                                className="group/collapsible"
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton
                                            tooltip="Coleções"
                                            isActive={location.pathname.startsWith("/collections")}
                                        >
                                            <Library className="h-4 w-4 shrink-0" />
                                            <span>Coleções</span>
                                            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            {collections.map((c) => {
                                                const path = `/collections/${c.id}`
                                                return (
                                                    <SidebarMenuSubItem key={c.id}>
                                                        <SidebarMenuSubButton
                                                            asChild
                                                            isActive={location.pathname === path}
                                                        >
                                                            <NavLink to={path}>
                                                                {c.name}
                                                            </NavLink>
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                )
                                            })}

                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton asChild onClick={() => setNewDialogOpen(true)}>
                                                    <button type="button" className="text-muted-foreground">
                                                        <Plus className="h-3.5 w-3.5" />
                                                        Nova coleção
                                                    </button>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>

                            <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Nova coleção</DialogTitle>
                                    </DialogHeader>
                                    <Input
                                        placeholder="e.g. 2026 Progression Portfolio"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    />
                                    <DialogFooter>
                                        <Button onClick={handleCreate} disabled={!newName.trim()}>
                                            Criar
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <SidebarSeparator className="my-2 mx-auto w-[calc(100%-1rem)] group-data-[collapsible=icon]:w-8" />

                            <Collapsible
                                asChild
                                defaultOpen={location.pathname.startsWith("/help")}
                                className="group/collapsible"
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton
                                            tooltip="Ajuda"
                                            isActive={location.pathname.startsWith("/help")}
                                        >
                                            <BookOpen className="h-4 w-4 shrink-0" />
                                            <span>Ajuda</span>
                                            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                    asChild
                                                    isActive={location.pathname === "/help/docs"}
                                                >
                                                    <NavLink to="/help/docs">
                                                        <FileText className="h-3.5 w-3.5 mr-1" /> Documentação
                                                    </NavLink>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                            <SidebarMenuSubItem>
                                                <SidebarMenuSubButton
                                                    asChild
                                                    isActive={location.pathname === "/help/support"}
                                                >
                                                    <NavLink to="/help/support">
                                                        <LifeBuoy className="h-3.5 w-3.5 mr-1" /> Suporte
                                                    </NavLink>
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
                <ServerStatusIndicator variant={state === "collapsed" ? "icon" : "full"} />
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