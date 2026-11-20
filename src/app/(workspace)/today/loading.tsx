import { PageHeader, Stack } from '@/ui/Layout';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';

/**
 * Today while it loads (section 3, "States"): the page's frame at once, with still shapes where
 * "Needs you" will be, and a line saying what's happening. No spinner on its own.
 */
export default function TodayLoading() {
  return (
    <Stack gap={8}>
      <PageHeader title="Today" />
      <SkeletonGroup label="Finding what needs you.">
        <Skeleton shape="title" width="short" />
        <Skeleton shape="control" />
        <Skeleton shape="control" />
        <Skeleton shape="control" />
      </SkeletonGroup>
    </Stack>
  );
}
