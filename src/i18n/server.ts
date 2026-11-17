// Server-only: the whole dictionary for a language (`ui` for the client provider, `page` for server prose and metadata),
// and the [lang] segment read safely. Client code reads its strings through useI18n() instead.
import { notFound } from 'next/navigation'
import { isLang, type Lang } from './langs'
import { en, type Messages } from './messages/en'
import { es } from './messages/es'
import { nl } from './messages/nl'
import { pl } from './messages/pl'
import { pt } from './messages/pt'

export const MESSAGES: Record<Lang, Messages> = { en, es, pt, nl, pl }

export function getMessages(lang: Lang): Messages {
  return MESSAGES[lang]
}

/** The page's language from its params; an unknown segment ("/nope" reaches /[lang]) is a 404. */
export async function langParam(params: Promise<{ lang: string }>): Promise<Lang> {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  return lang
}
