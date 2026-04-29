import type { ComponentProps } from 'react';
import { PointWordmark } from './PointWordmark';

/** Thin alias so existing imports keep working; pass `onHomeClick` etc. like `PointWordmark`. */
export function AnimatedPointLogo(props: ComponentProps<typeof PointWordmark>) {
  return <PointWordmark {...props} />;
}
