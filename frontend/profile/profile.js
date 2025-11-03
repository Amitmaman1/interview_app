import { initializeSupabase } from '/js/core/auth.js';

let supabase;
let user = null;

// Elements
const profileNameEl = document.getElementById('profile-name');
const profileEmailEl = document.getElementById('profile-email');
const profileAboutTextarea = document.getElementById('profile-about');
const profileSaveBtn = document.getElementById('profile-save');
const profileAvatarEl = document.getElementById('profile-avatar');
const profileRoleInput = document.getElementById('profile-role');
const profileLocationInput = document.getElementById('profile-location');
const profileYearsInput = document.getElementById('profile-years');
const profileSkillsInput = document.getElementById('profile-skills');
const profileAvgScoreEl = document.getElementById('profile-avg-score');
const avatarFileInput = document.getElementById('avatar-file');
const logoutBtn = document.getElementById('logout-btn');
const navProfileAvatar = document.getElementById('nav-profile-avatar');

let avatarCropModal = document.getElementById('avatar-crop-modal');
let avatarCropImage = document.getElementById('avatar-crop-image');
let avatarCropCancel = document.getElementById('avatar-crop-cancel');
let avatarCropSave = document.getElementById('avatar-crop-save');
let avatarCrop1x1 = document.getElementById('avatar-crop-1x1');
let avatarCrop4x5 = document.getElementById('avatar-crop-4x-5');
let avatarCropFree = document.getElementById('avatar-crop-free');

document.addEventListener('DOMContentLoaded', async () => {
    supabase = await initializeSupabase();
    if (!supabase) return;
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return;
    if (!session) {
        window.location.href = '/login';
        return;
    }
    user = session.user;
    await hydrateProfilePanel(user);
});

if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (!error) window.location.href = '/login';
});

function getLocalProfileKey(userId) {
    return `profile:${userId}`;
}

async function fetchUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('name, about, avatar_url, role, location, years_experience, skills, updated_at')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching profile:', error);
        }
        return data || null;
    } catch (e) {
        console.error('Unexpected profile fetch error:', e);
        return null;
    }
}

async function upsertUserProfile(userId, { name, about, avatar_url, role, location, years_experience, skills }) {
    const payload = { user_id: userId, name, about, avatar_url, role, location, years_experience, skills, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('profiles').upsert(payload).select().single();
    if (error) throw error;
    return data;
}

async function fetchUserAverageScore() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NaN;
        const res = await fetch('/api/sessions', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        if (!res.ok) return NaN;
        const all = await res.json();
        if (!Array.isArray(all) || all.length === 0) return NaN;
        const scores = all.map(s => Number(s.final_score)).filter(n => !isNaN(n));
        if (scores.length === 0) return NaN;
        const sum = scores.reduce((a, b) => a + b, 0);
        return sum / scores.length;
    } catch (e) {
        console.error('Failed calculating avg score', e);
        return NaN;
    }
}

async function hydrateProfilePanel(currentUser) {
    const email = currentUser.email || '';
    const fallbackName = email.includes('@') ? email.split('@')[0] : email;
    const prof = await fetchUserProfile(currentUser.id);
    const displayName = prof?.name || fallbackName;
    const about = prof?.about || '';

    if (profileNameEl) profileNameEl.textContent = displayName;
    if (profileEmailEl) profileEmailEl.textContent = email;
    if (profileAboutTextarea) profileAboutTextarea.value = about;
    if (profileRoleInput) profileRoleInput.value = prof?.role || '';
    if (profileLocationInput) profileLocationInput.value = prof?.location || '';
    if (profileYearsInput) profileYearsInput.value = typeof prof?.years_experience === 'number' ? prof.years_experience : '';
    if (profileSkillsInput) profileSkillsInput.value = prof?.skills || '';
    if (profileAvatarEl) {
        profileAvatarEl.innerHTML = '';
        if (prof?.avatar_url) {
            const img = document.createElement('img');
            img.src = prof.avatar_url;
            img.className = 'h-full w-full object-cover';
            img.alt = 'Avatar';
            profileAvatarEl.appendChild(img);
        } else {
            const initials = (displayName || email).trim().slice(0, 2).toUpperCase();
            profileAvatarEl.textContent = initials;
        }
    }

    const avg = await fetchUserAverageScore();
    if (profileAvgScoreEl) profileAvgScoreEl.textContent = isNaN(avg) ? '--' : avg.toFixed(1);

    // Update nav avatar on the profile page
    if (navProfileAvatar) {
        navProfileAvatar.innerHTML = '';
        if (prof?.avatar_url) {
            const img = document.createElement('img');
            img.src = prof.avatar_url;
            img.className = 'h-full w-full object-cover';
            img.alt = 'Avatar';
            navProfileAvatar.appendChild(img);
        } else {
            const initials = (displayName || email).trim().slice(0, 2).toUpperCase();
            navProfileAvatar.textContent = initials;
        }
    }
}

let cropperInstance = null;

function openAvatarCropper(file) {
    if (!avatarCropModal || !avatarCropImage) return;
    const reader = new FileReader();
    reader.onload = () => {
        avatarCropImage.src = reader.result;
        avatarCropModal.classList.remove('hidden');
        avatarCropModal.classList.add('flex');
        cropperInstance = new (window.Cropper || Cropper)(avatarCropImage, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            background: false,
            autoCropArea: 1,
        });
    };
    reader.readAsDataURL(file);
}

async function uploadAvatarBlob(userId, blob) {
    const fileName = `${userId}/${Date.now()}.png`;
    const { data, error } = await supabase.storage.from('avatars').upload(fileName, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
    const uploadedPath = data?.path || fileName;
    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(uploadedPath);
    return publicUrlData.publicUrl;
}

function closeAvatarCropper() {
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    if (avatarCropModal) {
        avatarCropModal.classList.add('hidden');
        avatarCropModal.classList.remove('flex');
    }
}

if (avatarFileInput) {
    avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        openAvatarCropper(file);
        e.target.value = '';
    });
}

if (avatarCropCancel) avatarCropCancel.addEventListener('click', () => closeAvatarCropper());
if (avatarCrop1x1) avatarCrop1x1.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(1));
if (avatarCrop4x5) avatarCrop4x5.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(4 / 5));
if (avatarCropFree) avatarCropFree.addEventListener('click', () => cropperInstance && cropperInstance.setAspectRatio(NaN));
if (avatarCropSave) avatarCropSave.addEventListener('click', onAvatarCropSave);

async function onAvatarCropSave() {
    try {
        if (!cropperInstance || !user) return;
        const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256, imageSmoothing: true, imageSmoothingQuality: 'high' });
        const blob = await new Promise((resolve) => canvas && canvas.toBlob ? canvas.toBlob(resolve, 'image/png') : resolve(null));
        if (!blob) throw new Error('Failed to produce image');
        const publicUrl = await uploadAvatarBlob(user.id, blob);
        await upsertUserProfile(user.id, { name: profileNameEl.textContent.trim(), about: profileAboutTextarea.value, avatar_url: publicUrl, role: profileRoleInput?.value, location: profileLocationInput?.value, years_experience: profileYearsInput?.value ? Number(profileYearsInput.value) : undefined, skills: profileSkillsInput?.value });
        profileAvatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = publicUrl;
        img.className = 'h-full w-full object-cover';
        profileAvatarEl.appendChild(img);
        
        // Update nav avatar too
        if (navProfileAvatar) {
            navProfileAvatar.innerHTML = '';
            const navImg = document.createElement('img');
            navImg.src = publicUrl;
            navImg.className = 'h-full w-full object-cover';
            navImg.alt = 'Avatar';
            navProfileAvatar.appendChild(navImg);
        }
        
        closeAvatarCropper();
    } catch (err) {
        console.error('Avatar save error', err);
    }
}

if (profileSaveBtn) {
    profileSaveBtn.addEventListener('click', async () => {
        try {
            if (!user) return;
            const newName = (profileNameEl?.textContent || '').trim();
            const newAbout = profileAboutTextarea ? profileAboutTextarea.value : '';
            const role = profileRoleInput ? profileRoleInput.value : undefined;
            const location = profileLocationInput ? profileLocationInput.value : undefined;
            const years = profileYearsInput && profileYearsInput.value !== '' ? Number(profileYearsInput.value) : undefined;
            const skills = profileSkillsInput ? profileSkillsInput.value : undefined;
            profileSaveBtn.disabled = true;
            profileSaveBtn.textContent = 'Saving...';
            await upsertUserProfile(user.id, { name: newName, about: newAbout, avatar_url: undefined, role, location, years_experience: years, skills });
            profileSaveBtn.textContent = 'Saved';
            setTimeout(() => { profileSaveBtn.textContent = 'Save'; profileSaveBtn.disabled = false; }, 1000);
            if (profileAvatarEl && !profileAvatarEl.querySelector('img')) {
                profileAvatarEl.textContent = (newName || (user.email || '')).trim().slice(0, 2).toUpperCase();
            }
            const avg = await fetchUserAverageScore();
            if (profileAvgScoreEl) profileAvgScoreEl.textContent = isNaN(avg) ? '--' : avg.toFixed(1);
        } catch (e) {
            console.error('Profile save failed', e);
            profileSaveBtn.textContent = 'Save';
            profileSaveBtn.disabled = false;
        }
    });
}

if (profileAvatarEl && avatarFileInput) {
    profileAvatarEl.addEventListener('click', () => avatarFileInput.click());
    profileAvatarEl.style.cursor = 'pointer';
}


