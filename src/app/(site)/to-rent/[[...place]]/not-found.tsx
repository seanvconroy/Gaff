import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { placePageCopy as copy } from '@/copy/place-pages';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

export const metadata: Metadata = { title: copy.notFound.title };

/** M62: an address under /to-rent that names no place in Gaff's place index. */
export default function PlaceNotFound() {
  return (
    <EmptyState
      icon={MapPin}
      title={copy.notFound.title}
      action={
        <ButtonLink href="/" variant="primary">
          {copy.notFound.action}
        </ButtonLink>
      }
    >
      <p>{copy.notFound.text}</p>
    </EmptyState>
  );
}
