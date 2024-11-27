import * as api from '@/api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const emptyUser: SessionUser = {
	email: '',
	first_name: '',
	last_name: '',
	full_name: '',
	user_image: '',
	is_admin: false,
	is_user: false,
	country: '',
	locale: 'en-US',
	is_v2_user: false,
	default_version: '',
}

const sessionStore = defineStore('insights:session', function () {
	const initialized = ref(false)
	const user = ref(emptyUser)

	const isLoggedIn = computed(() => user.value.email && user.value.email !== 'Guest')
	const isAuthorized = computed(() => user.value.is_admin || user.value.is_user)

	async function initialize(force: boolean = false) {
		if (initialized.value && !force) return
		Object.assign(user.value, getSessionFromCookies())
		isLoggedIn.value && (await fetchSessionInfo())
		isLoggedIn.value && api.trackActiveSite()
		initialized.value = true
	}

	async function fetchSessionInfo() {
		if (!isLoggedIn.value) return
		const userInfo: SessionUser = await api.fetchUserInfo()
		Object.assign(user.value, {
			...userInfo,
			is_admin: Boolean(userInfo.is_admin),
			is_user: Boolean(userInfo.is_user),
			is_v2_user: Boolean(userInfo.is_v2_user),
		})
	}

	async function login(email: string, password: string) {
		resetSession()
		const userInfo = await api.login(email, password)
		if (!userInfo) return
		Object.assign(user.value, userInfo)
		window.location.reload()
	}

	async function logout() {
		resetSession()
		await api.logout()
		window.location.reload()
	}

	function resetSession() {
		Object.assign(user, emptyUser)
	}

	// should be moved to some other store, but where? 🤔
	async function createViewLog(recordType: string, recordName: string) {
		if (!isLoggedIn) return
		await api.createLastViewedLog(recordType, recordName)
	}

	function updateDefaultVersion(version: SessionUser['default_version']) {
		user.value.default_version = version
		return api.updateDefaultVersion(version)
	}

	return {
		user: user,
		initialized,
		isLoggedIn,
		isAuthorized,
		initialize,
		fetchSessionInfo,
		login,
		logout,
		resetSession,
		createViewLog,
		updateDefaultVersion,
	}
})

function getSessionFromCookies() {
	return document.cookie
		.split('; ')
		.map((c) => c.split('='))
		.reduce((acc, [key, value]) => {
			key = key == 'user_id' ? 'email' : key
			acc[key] = decodeURIComponent(value)
			return acc
		}, {} as any)
}

export default sessionStore
export type sessionStore = ReturnType<typeof sessionStore>
