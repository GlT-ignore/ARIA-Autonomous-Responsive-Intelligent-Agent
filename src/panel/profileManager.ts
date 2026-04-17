/**
 * Profile Manager Module
 * Handles user profile save/load/auto-load UI bindings
 */

import { loadUserProfile, saveUserProfile } from '../shared/userProfile';
import { log } from './uiState';

function getProfileField(id: string): HTMLInputElement {
	return document.getElementById(id) as HTMLInputElement;
}

function fillProfileForm(profile: Awaited<ReturnType<typeof loadUserProfile>>) {
	const fields: Record<string, string | number> = {
		'profile-firstName': profile.personal.firstName,
		'profile-lastName': profile.personal.lastName,
		'profile-email': profile.personal.email,
		'profile-phone': profile.personal.phone,
		'profile-location': profile.personal.location,
		'profile-title': profile.professional.currentTitle,
		'profile-experience': profile.professional.yearsOfExperience,
	};
	for (const [id, val] of Object.entries(fields)) {
		const el = getProfileField(id);
		if (el) el.value = String(val);
	}
}

export function initProfileButtons() {
	document.getElementById('save-profile')?.addEventListener('click', async () => {
		const profile = {
			personal: {
				firstName: getProfileField('profile-firstName').value,
				lastName: getProfileField('profile-lastName').value,
				email: getProfileField('profile-email').value,
				phone: getProfileField('profile-phone').value,
				location: getProfileField('profile-location').value
			},
			professional: {
				currentTitle: getProfileField('profile-title').value,
				yearsOfExperience: parseInt(getProfileField('profile-experience').value || '0'),
				currentCompany: '',
				resumeFileName: '',
				coverLetter: ''
			},
			preferences: {
				employmentTypes: ['Full-time'],
				workArrangement: ['Remote', 'Hybrid'],
				willingToRelocate: false,
				requiresSponsorship: false
			},
			education: {
				degree: '',
				fieldOfStudy: '',
				university: '',
				graduationYear: new Date().getFullYear()
			}
		};

		try {
			await saveUserProfile(profile);
			log({ info: 'Profile saved successfully' });
		} catch (error) {
			log({ error: 'Failed to save profile', details: String(error) });
		}
	});

	document.getElementById('load-profile')?.addEventListener('click', async () => {
		try {
			const profile = await loadUserProfile();
			fillProfileForm(profile);
			log({ info: 'Profile loaded successfully' });
		} catch (error) {
			log({ error: 'Failed to load profile', details: String(error) });
		}
	});
}

export async function autoLoadProfile() {
	try {
		const profile = await loadUserProfile();
		if (profile.personal.firstName) {
			fillProfileForm(profile);
		}
	} catch { }
}
