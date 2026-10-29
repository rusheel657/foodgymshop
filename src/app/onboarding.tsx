import { useSQLiteContext } from 'expo-sqlite';

import { ProfileForm } from '@/components/profile-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { saveProfile } from '@/db/profile';
import { useAccount } from '@/lib/account';

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const { userId } = useAccount();
  return (
    <Screen title="Set up">
      <ThemedText themeColor="textSecondary">A few details to calculate your daily targets.</ThemedText>
      {/* Saving flips the root guard to the tabs. */}
      <ProfileForm submitLabel="Start" onSubmit={(p) => saveProfile(db, userId, p)} />
    </Screen>
  );
}
