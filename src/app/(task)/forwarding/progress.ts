import { forwardingCopy } from '@/copy/forwarding';

/** The flow's progress through its four screens (section 4, "Forwarding enquiries"). */
export function progress(current: number) {
  return { label: forwardingCopy.flow, segments: forwardingCopy.segments, current };
}
