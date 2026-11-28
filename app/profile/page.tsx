import type {Metadata} from 'next';
import ProfilePage from '@/components/ProfilePage';
export const metadata: Metadata = {title: 'Your profile · PlayTogether'};
export default function Profile(){return <ProfilePage/>}
