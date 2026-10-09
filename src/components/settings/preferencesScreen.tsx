import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePreferencesStore } from '@/store/preferenceStore'
import { cn } from '@/lib/utils'

interface Option<T extends string> {
    value: T
    label: string
    icon?: ComponentType<{ className?: string }>
}

/**
 * Every choice laid out side by side with its label, rather than a toggle
 * that cycles — so users see all options at once (NFR-10-04).
 */
function OptionGroup<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: Option<T>[]
    onChange: (value: T) => void
}) {
    return (
        <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-3">
            {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
                const selected = optionValue === value
                return (
                    <button
                        key={optionValue}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(optionValue)}
                        className={cn(
                            'flex items-center gap-3 rounded-md border p-4 text-left text-sm transition-colors',
                            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected && 'border-primary bg-primary/5 font-medium',
                        )}
                    >
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="flex-1">{optionLabel}</span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                )
            })}
        </div>
    )
}

export function PreferencesScreen() {
    const { t } = useTranslation(['settings', 'common'])
    const { theme, language, error, setTheme, setLanguage } = usePreferencesStore()

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">{t('settings:preferences.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('settings:preferences.description')}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('settings:preferences.theme.title')}</CardTitle>
                    <CardDescription>{t('settings:preferences.theme.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <OptionGroup
                        label={t('settings:preferences.theme.title')}
                        value={theme}
                        onChange={setTheme}
                        options={[
                            { value: 'light', label: t('settings:preferences.theme.light'), icon: Sun },
                            { value: 'dark', label: t('settings:preferences.theme.dark'), icon: Moon },
                            { value: 'system', label: t('settings:preferences.theme.system'), icon: Monitor },
                        ]}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('settings:preferences.language.title')}</CardTitle>
                    <CardDescription>{t('settings:preferences.language.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <OptionGroup
                        label={t('settings:preferences.language.title')}
                        value={language}
                        onChange={setLanguage}
                        // Each language is named in itself, so it stays recognizable
                        // whatever the current UI language is.
                        options={[
                            { value: 'pt-BR', label: 'Português (Brasil)' },
                            { value: 'en', label: 'English' },
                        ]}
                    />
                </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">{t('settings:preferences.autoSave')}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    )
}
