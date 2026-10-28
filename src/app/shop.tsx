import { EmptyState, Screen } from '@/components/screen';

export default function ShopScreen() {
  return (
    <Screen title="Shopping list">
      <EmptyState text="Add foods to My Diet to build your list." />
    </Screen>
  );
}
