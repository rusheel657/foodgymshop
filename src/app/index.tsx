import { EmptyState, Screen } from '@/components/screen';

export default function FoodScreen() {
  return (
    <Screen title="Today">
      <EmptyState text="No food logged yet." />
    </Screen>
  );
}
