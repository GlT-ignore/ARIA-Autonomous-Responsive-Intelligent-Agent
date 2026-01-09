/**
 * User Profile Management for Form Auto-Fill
 */

export interface UserProfile {
    personal: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        location: string;
        linkedin?: string;
        github?: string;
        portfolio?: string;
    };
    professional: {
        resumeFileName: string; // Note: Can't access file system directly
        coverLetter: string;
        yearsOfExperience: number;
        currentTitle: string;
        currentCompany: string;
        desiredSalary?: string;
    };
    preferences: {
        employmentTypes: string[]; // ["Full-time", "Contract", "Part-time"]
        workArrangement: string[]; // ["Remote", "Hybrid", "On-site"]
        willingToRelocate: boolean;
        requiresSponsorship: boolean;
    };
    education: {
        degree: string;
        fieldOfStudy: string;
        university: string;
        graduationYear: number;
    };
}

const PROFILE_KEY = 'webpilot_user_profile';

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
    // Merge with existing profile
    const existing = await loadUserProfile();
    const merged = {
        personal: { ...existing.personal, ...profile.personal },
        professional: { ...existing.professional, ...profile.professional },
        preferences: { ...existing.preferences, ...profile.preferences },
        education: { ...existing.education, ...profile.education }
    };
    await chrome.storage.local.set({ [PROFILE_KEY]: merged });
}

export async function loadUserProfile(): Promise<UserProfile> {
    const data = await chrome.storage.local.get(PROFILE_KEY);
    return (data[PROFILE_KEY] as UserProfile) || getDefaultProfile();
}

export async function clearUserProfile(): Promise<void> {
    await chrome.storage.local.remove(PROFILE_KEY);
}

function getDefaultProfile(): UserProfile {
    return {
        personal: {
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            location: ''
        },
        professional: {
            resumeFileName: '',
            coverLetter: '',
            yearsOfExperience: 0,
            currentTitle: '',
            currentCompany: ''
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
}

/**
 * Get form field value from profile based on field description
 */
export function getProfileValue(profile: UserProfile, fieldDescription: string): string | undefined {
    const lower = fieldDescription.toLowerCase();
    
    // Personal info
    if (/(first|given)\s*name/i.test(lower)) return profile.personal.firstName;
    if (/(last|family|sur)\s*name/i.test(lower)) return profile.personal.lastName;
    if (/email/i.test(lower)) return profile.personal.email;
    if (/phone|mobile|tel/i.test(lower)) return profile.personal.phone;
    if (/location|city|address/i.test(lower)) return profile.personal.location;
    if (/linkedin/i.test(lower)) return profile.personal.linkedin;
    if (/github/i.test(lower)) return profile.personal.github;
    if (/portfolio|website/i.test(lower)) return profile.personal.portfolio;
    
    // Professional info
    if (/resume|cv/i.test(lower)) return profile.professional.resumeFileName;
    if (/cover\s*letter/i.test(lower)) return profile.professional.coverLetter;
    if (/experience|years/i.test(lower)) return String(profile.professional.yearsOfExperience);
    if (/current\s*title|job\s*title/i.test(lower)) return profile.professional.currentTitle;
    if (/current\s*company|employer/i.test(lower)) return profile.professional.currentCompany;
    if (/salary/i.test(lower)) return profile.professional.desiredSalary;
    
    // Education
    if (/degree/i.test(lower)) return profile.education.degree;
    if (/field|major|study/i.test(lower)) return profile.education.fieldOfStudy;
    if (/university|college|school/i.test(lower)) return profile.education.university;
    if (/graduation/i.test(lower)) return String(profile.education.graduationYear);
    
    return undefined;
}

/**
 * Match employment type from profile
 */
export function matchEmploymentType(profile: UserProfile, options: string[]): string | undefined {
    for (const pref of profile.preferences.employmentTypes) {
        const match = options.find(opt => 
            opt.toLowerCase().includes(pref.toLowerCase())
        );
        if (match) return match;
    }
    return options[0]; // Fallback to first option
}

/**
 * Match work arrangement from profile
 */
export function matchWorkArrangement(profile: UserProfile, options: string[]): string | undefined {
    for (const pref of profile.preferences.workArrangement) {
        const match = options.find(opt => 
            opt.toLowerCase().includes(pref.toLowerCase())
        );
        if (match) return match;
    }
    return options[0]; // Fallback to first option
}

