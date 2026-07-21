import { Link } from 'react-router-dom'
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Fragment } from 'react'

export function BreadcrumbTrail() {
    const crumbs = useBreadcrumbs()

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {crumbs.map((crumb, i) => (
                    <Fragment key={`${crumb.label}-${i}`}>
                        <BreadcrumbItem>
                            {crumb.path ? (
                                <BreadcrumbLink asChild>
                                    <Link to={crumb.path}>{crumb.label}</Link>
                                </BreadcrumbLink>
                            ) : (
                                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                            )}
                        </BreadcrumbItem>
                        {i < crumbs.length - 1 && <BreadcrumbSeparator />}
                    </Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}