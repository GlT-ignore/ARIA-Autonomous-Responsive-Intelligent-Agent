/**
 * User Profile Management for Form Auto-Fill
 */

export interface UserProfile {
    personal: {
        firstName: string;
        lastName: string;
        fullName: string; // Auto-computed or custom
        email: string;
        phone: string;
        location: string;
        linkedin?: string;
        github?: string;
        portfolio?: string;
    };
    address: {
        street: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
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
        preferredPaymentMethod?: string; // "Credit Card", "PayPal", etc.
        preferredShippingMethod?: string; // "Standard", "Express", etc.
        dietaryRestrictions?: string[]; // ["Vegetarian", "Vegan", "Gluten-Free", etc.]
    };
    education: {
        degree: string;
        fieldOfStudy: string;
        university: string;
        graduationYear: number;
    };
    customFields: Record<string, string>; // User-defined fields
    sensitiveFieldsEncrypted: boolean; // Future: encrypt sensitive data
}

const PROFILE_KEY = 'webpilot_user_profile';

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
    // Merge with existing profile
    const existing = await loadUserProfile();
    const merged = {
        personal: { ...existing.personal, ...profile.personal },
        address: { ...existing.address, ...profile.address },
        professional: { ...existing.professional, ...profile.professional },
        preferences: { ...existing.preferences, ...profile.preferences },
        education: { ...existing.education, ...profile.education },
        customFields: { ...existing.customFields, ...profile.customFields },
        sensitiveFieldsEncrypted: profile.sensitiveFieldsEncrypted ?? existing.sensitiveFieldsEncrypted
    };

    // Auto-compute fullName if not provided
    if (!merged.personal.fullName && merged.personal.firstName && merged.personal.lastName) {
        merged.personal.fullName = `${merged.personal.firstName} ${merged.personal.lastName}`;
    }

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
            fullName: '',
            email: '',
            phone: '',
            location: ''
        },
        address: {
            street: '',
            city: '',
            state: '',
            zipCode: '',
            country: ''
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
            requiresSponsorship: false,
            dietaryRestrictions: []
        },
        education: {
            degree: '',
            fieldOfStudy: '',
            university: '',
            graduationYear: new Date().getFullYear()
        },
        customFields: {},
        sensitiveFieldsEncrypted: false
    };
}

/**
 * Get form field value from profile based on field description
 */
export function getProfileValue(profile: UserProfile, fieldDescription: string): string | undefined {
    const lower = fieldDescription.toLowerCase();

    // Helper: extract parts from "City, State/Country" style location string
    const locationParts = (profile.personal.location || '').split(',').map(s => s.trim()).filter(Boolean);

    // Personal info — handle both "First Name" AND reversed "Name First" (from name attr parsing)
    if (/(first|given)\s*name|name\s*(first|given)/i.test(lower)) return profile.personal.firstName || undefined;
    if (/(last|family|sur)\s*name|name\s*(last|family|sur)/i.test(lower)) return profile.personal.lastName || undefined;
    if (/full\s*name/i.test(lower)) return profile.personal.fullName || `${profile.personal.firstName} ${profile.personal.lastName}`.trim() || undefined;
    // Generic "name" field — only if no first/last/full qualifier
    if (/\bname\b/i.test(lower) && !/(first|last|full|given|family|sur|user|company|org|school|university|middle)/i.test(lower)) {
        return profile.personal.fullName || `${profile.personal.firstName} ${profile.personal.lastName}`.trim() || undefined;
    }
    if (/email/i.test(lower)) return profile.personal.email || undefined;
    if (/phone|mobile|tel/i.test(lower)) return profile.personal.phone || undefined;
    if (/linkedin/i.test(lower)) return profile.personal.linkedin || undefined;
    if (/github/i.test(lower)) return profile.personal.github || undefined;
    if (/portfolio|website/i.test(lower)) return profile.personal.portfolio || undefined;

    // Address fields — also handle "addr" abbreviation and "address X" labels from name-attr parsing
    if (/street|address\s*(line|addr|1|one)|addr\s*(line|1|one)/i.test(lower) && !/city|state|zip|postal|line\s*2|addr\s*line\s*2/i.test(lower)) {
        return profile.address.street || undefined;
    }
    if (/address\s*(line\s*2|addr\s*line\s*2)|addr\s*line\s*2/i.test(lower)) {
        return undefined; // No line 2 in profile — leave blank
    }
    if (/\bcity\b/i.test(lower)) {
        return profile.address.city || locationParts[0] || undefined;
    }
    if (/\b(state|province)\b/i.test(lower)) {
        // "Vijayawada, India" → state would be index 1 if only 2 parts, skip if it looks like a country
        const stateGuess = profile.address.state || (locationParts.length >= 2 ? locationParts[locationParts.length - 2] : undefined);
        return stateGuess || undefined;
    }
    if (/zip|postal/i.test(lower)) return profile.address.zipCode || undefined;
    if (/\bcountry\b/i.test(lower)) {
        return profile.address.country || (locationParts.length >= 2 ? locationParts[locationParts.length - 1] : undefined);
    }

    // General location (city, state format)
    if (/location/i.test(lower)) {
        if (profile.address.city && profile.address.state) return `${profile.address.city}, ${profile.address.state}`;
        return profile.personal.location || undefined;
    }

    // Professional info
    if (/resume|cv/i.test(lower)) return profile.professional.resumeFileName || undefined;
    if (/cover\s*letter/i.test(lower)) return profile.professional.coverLetter || undefined;
    if (/experience|years/i.test(lower)) return profile.professional.yearsOfExperience ? String(profile.professional.yearsOfExperience) : undefined;
    if (/current\s*title|job\s*title|position|applying\s*for|job\s*role/i.test(lower)) return profile.professional.currentTitle || undefined;
    if (/current\s*company|employer|company\s*name/i.test(lower)) return profile.professional.currentCompany || undefined;
    if (/salary|compensation|pay\s*range|desired.*pay|expected.*pay/i.test(lower)) return profile.professional.desiredSalary || undefined;

    // Education
    if (/\bdegree\b/i.test(lower)) return profile.education.degree || undefined;
    if (/field|major|study/i.test(lower)) return profile.education.fieldOfStudy || undefined;
    if (/university|college|school/i.test(lower)) return profile.education.university || undefined;
    if (/graduation/i.test(lower)) return profile.education.graduationYear ? String(profile.education.graduationYear) : undefined;

    // Preferences
    if (/payment\s*method/i.test(lower)) return profile.preferences.preferredPaymentMethod || undefined;
    if (/shipping\s*method/i.test(lower)) return profile.preferences.preferredShippingMethod || undefined;
    if (/dietary/i.test(lower)) return profile.preferences.dietaryRestrictions?.join(', ') || undefined;

    // Custom fields
    for (const [key, value] of Object.entries(profile.customFields)) {
        if (lower.includes(key.toLowerCase())) return value;
    }

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

