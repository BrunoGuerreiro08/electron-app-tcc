import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const SECTIONS = [
    'gettingStarted',
    'collections',
    'scoring',
    'documents',
    'templates',
    'exporting',
    'reviews',
    'sync',
    'settings',
] as const

export function DocumentationScreen() {
    const { t } = useTranslation('help')

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">{t('docs.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('docs.description')}</p>
            </div>

            <Card>
                <CardContent>
                    <Accordion type="multiple" defaultValue={['gettingStarted']}>
                        {SECTIONS.map((id) => (
                            <AccordionItem key={id} value={id}>
                                <AccordionTrigger className="text-sm">{t(`docs.sections.${id}.title`)}</AccordionTrigger>
                                <AccordionContent className="space-y-3 text-sm">
                                    <p className="text-muted-foreground">{t(`docs.sections.${id}.intro`)}</p>
                                    <ul className="list-disc space-y-1.5 pl-5">
                                        {(t(`docs.sections.${id}.items`, { returnObjects: true }) as string[]).map(
                                            (item, i) => (
                                                <li key={i}>{item}</li>
                                            )
                                        )}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    )
}
