import { watchDebounced } from '@vueuse/core'
import domtoimage from 'dom-to-image'
import { Socket } from 'socket.io-client'
import { ComputedRef, inject, onBeforeUnmount, Ref, watch } from 'vue'
import session from '../session'
import {
	ColumnDataType,
	DropdownOption,
	GroupedDropdownOption,
	QueryResultColumn,
} from '../types/query.types'
import { FIELDTYPES } from './constants'
import { createToast } from './toasts'
import { getFormattedDate } from '../query/helpers'

export function getUniqueId(length = 8) {
	return (+new Date() * Math.random()).toString(36).substring(0, length)
}

export function titleCase(str: string) {
	return str
		.toLowerCase()
		.split(' ')
		.map(function (word) {
			return word.charAt(0).toUpperCase() + word.slice(1)
		})
		.join(' ')
}

export function copy<T>(obj: T) {
	return JSON.parse(JSON.stringify(obj)) as T
}

export function wheneverChanges(
	getter: Ref | ComputedRef | Function,
	callback: Function,
	options: any = {}
) {
	let prevValue: any
	function onChange(value: any) {
		if (areDeeplyEqual(value, prevValue)) return
		prevValue = value
		callback(value)
	}
	return watchDebounced(getter, onChange, options)
}

export function areDeeplyEqual(obj1: any, obj2: any): boolean {
	if (obj1 === obj2) return true

	if (Array.isArray(obj1) && Array.isArray(obj2)) {
		if (obj1.length !== obj2.length) return false

		return obj1.every((elem, index) => {
			return areDeeplyEqual(elem, obj2[index])
		})
	}

	if (typeof obj1 === 'object' && typeof obj2 === 'object' && obj1 !== null && obj2 !== null) {
		if (Array.isArray(obj1) || Array.isArray(obj2)) return false

		const keys1 = Object.keys(obj1)
		const keys2 = Object.keys(obj2)

		if (keys1.length !== keys2.length || !keys1.every((key) => keys2.includes(key))) return false

		for (let key in obj1) {
			let isEqual = areDeeplyEqual(obj1[key], obj2[key])
			if (!isEqual) {
				return false
			}
		}

		return true
	}

	return false
}

export function waitUntil(fn: () => boolean) {
	return new Promise<void>((resolve) => {
		if (fn()) {
			resolve()
			return
		}
		const stop = watch(fn, (value) => {
			if (value) {
				stop()
				resolve()
			}
		})
	})
}

export function store<T>(key: string, value: () => T) {
	const stored = localStorage.getItem(key)
	watchDebounced(value, (val) => localStorage.setItem(key, JSON.stringify(val)), {
		debounce: 500,
		deep: true,
	})
	return stored ? JSON.parse(stored) : value()
}

export function getErrorMessage(err: any) {
	const lastLine = err.exc
		?.split('\n')
		.filter(Boolean)
		.at(-1)
		?.trim()
		.split(': ')
		.slice(1)
		.join(': ')
	return lastLine || err.message || err.toString()
}

export function showErrorToast(err: Error, raise = true) {
	createToast({
		variant: 'error',
		title: 'Error',
		message: getErrorMessage(err),
	})
	if (raise) throw err
}

export function downloadImage(element: HTMLElement, filename: string, scale = 1, options = {}) {
	return domtoimage
		.toPng(element, {
			height: element.offsetHeight * scale,
			width: element.offsetWidth * scale,
			style: {
				transform: 'scale(' + scale + ')',
				transformOrigin: 'top left',
				width: element.offsetWidth + 'px',
				height: element.offsetHeight + 'px',
			},
			bgColor: 'white',
			...options,
		})
		.then(function (dataUrl: string) {
			const img = new Image()
			img.src = dataUrl
			img.onload = async () => {
				const link = document.createElement('a')
				link.download = filename
				link.href = img.src
				link.click()
			}
		})
}

export function formatNumber(number: number, precision = 2) {
	if (isNaN(number)) return number
	precision = precision || guessPrecision(number)
	const locale = session.user?.country == 'India' ? 'en-IN' : session.user?.locale
	return new Intl.NumberFormat(locale || 'en-US', {
		maximumFractionDigits: precision,
	}).format(number)
}

export function guessPrecision(number: number) {
	// eg. 1.0 precision = 1, 1.00 precision = 2
	const str = number.toString()
	const decimalIndex = str.indexOf('.')
	if (decimalIndex === -1) return 0
	return Math.min(str.length - decimalIndex - 1, 2)
}

export function getShortNumber(number: number, precision = 0) {
	const locale = session.user?.country == 'India' ? 'en-IN' : session.user?.locale
	let formatted = new Intl.NumberFormat(locale || 'en-US', {
		notation: 'compact',
		maximumFractionDigits: precision,
	}).format(number)

	if (locale == 'en-IN') {
		formatted = formatted.replace('T', 'K')
	}
	return formatted
}

export function fuzzySearch(arr: any[], { term, keys }: { term: string; keys: string[] }) {
	// search for term in all keys of arr items and sort by relevance
	const lowerCaseTerm = term.toLowerCase()
	type Result = { item: any; score: number }
	const results: Result[] = arr.reduce((acc, item) => {
		const score = keys.reduce((acc, key) => {
			const value = item[key]
			if (value) {
				const match = value.toLowerCase().indexOf(lowerCaseTerm)
				if (match !== -1) {
					return acc + match + 1
				}
			}
			return acc
		}, 0)
		if (score) {
			acc.push({ item, score })
		}
		return acc
	}, [])
	return results.sort((a, b) => a.score - b.score).map((item) => item.item)
}

export function safeJSONParse(str: string, defaultValue = null) {
	if (str === null || str === undefined) {
		return defaultValue
	}

	if (typeof str !== 'string') {
		return str
	}

	try {
		return JSON.parse(str)
	} catch (e) {
		console.groupCollapsed('Error parsing JSON')
		console.log(str)
		console.error(e)
		console.groupEnd()
		createToast({
			message: 'Error parsing JSON',
			variant: 'error',
		})
		return defaultValue
	}
}

export function copyToClipboard(text: string) {
	if (navigator.clipboard) {
		navigator.clipboard.writeText(text)
		createToast({
			variant: 'success',
			title: 'Copied to clipboard',
		})
	} else {
		// try to use execCommand
		const textArea = document.createElement('textarea')
		textArea.value = text
		textArea.style.position = 'fixed'
		document.body.appendChild(textArea)
		textArea.focus()
		textArea.select()
		try {
			document.execCommand('copy')
			createToast({
				variant: 'success',
				title: 'Copied to clipboard',
			})
		} catch (err) {
			createToast({
				variant: 'error',
				title: 'Copy to clipboard not supported',
			})
		} finally {
			document.body.removeChild(textArea)
		}
	}
}

export function ellipsis(value: string, length: number) {
	if (value && value.length > length) {
		return value.substring(0, length) + '...'
	}
	return value
}

export function flattenOptions(
	options: DropdownOption[] | GroupedDropdownOption[]
): DropdownOption[] {
	if (!options.length) return []
	return 'group' in options[0]
		? (options as GroupedDropdownOption[]).map((c) => c.items).flat()
		: (options as DropdownOption[])
}

export function scrub(text: string, spacer = '_') {
	return text.replace(/ /g, spacer).toLowerCase()
}

type OptionKey = keyof DropdownOption
export function toOptions(arr: any[], map: Record<OptionKey, string>) {
	return arr.map((item) => {
		Object.keys(map).forEach((key) => {
			// @ts-ignore
			item[key] = item[map[key]]
		})
		return item
	})
}

export function sanitizeColumnName(name: string) {
	return name
		? name
				.trim()
				.replace(' ', '_')
				.replace('-', '_')
				.replace('.', '_')
				.replace('/', '_')
				.replace('(', '_')
				.replace(')', '_')
				.toLowerCase()
		: name
}

export function isDate(data_type: ColumnDataType) {
	return FIELDTYPES.DATE.includes(data_type)
}

export function isNumber(data_type: ColumnDataType) {
	return FIELDTYPES.NUMBER.includes(data_type)
}

export function isString(data_type: ColumnDataType) {
	return FIELDTYPES.TEXT.includes(data_type)
}

export function attachRealtimeListener(event: string, callback: (...args: any[]) => void) {
	const $socket = inject<Socket>('$socket')!
	$socket.on(event, callback)
	onBeforeUnmount(() => {
		$socket.off(event)
	})
}

export function createHeaders(columns: QueryResultColumn[]) {
	const nestedColumns = columns.filter((column) => column.name.includes('___'))
	const levels = nestedColumns.length ? nestedColumns[0].name.split('___').length : 1

	const _columns = columns.map((column) => {
		return {
			...column,
			isNested: column.name.includes('___'),
			// ibis returns nested columns as value1___column1, value2___column1, value3___column1
			// using the columns as it is will show the value1 on the top and column1, column2, column3 as nested columns
			// so we reverse the parts to show column1 on the top and value1, value2, value3 as nested columns
			parts: column.name.split('___').reverse(),
		}
	})

	const headers = []

	for (let level = 0; level < levels; level++) {
		const headerRow = []

		for (let column of _columns) {
			const isNested = column.isNested
			const isLast = level === levels - 1

			headerRow.push({
				label: isNested ? column.parts[level] : isLast ? column.name : '',
				level,
				isLast,
				column: column,
			})
		}

		headers.push(headerRow)
	}

	const groupedHeaders = []

	for (let headerRow of headers) {
		const groupedHeaderRow = []

		let currentHeader = headerRow[0]
		let currentColspan = 1

		for (let i = 1; i < headerRow.length; i++) {
			const header = headerRow[i]

			if (header.label === currentHeader.label) {
				currentColspan++
			} else {
				groupedHeaderRow.push({
					...currentHeader,
					colspan: currentColspan,
				})
				currentHeader = header
				currentColspan = 1
			}
		}

		groupedHeaderRow.push({
			...currentHeader,
			colspan: currentColspan,
		})

		groupedHeaders.push(groupedHeaderRow)
	}

	// if header rows have items with values like: 2016-10-01, 2016-11-01, 2016-12-01
	// i.e first day of each month, then we format the values as 'Oct 2016', 'Nov 2016', 'Dec 2016'

	for (let headerRow of groupedHeaders) {
		const areFirstOfYear = areFirstDayOfYear(headerRow.map((header) => header.label))
		const areFirstOfMonth = areFirstDayOfMonth(headerRow.map((header) => header.label))
		const areDates = areValidDates(headerRow.map((header) => header.label))

		for (let header of headerRow) {
			if (!isValidDate(header.label)) continue

			if (areFirstOfYear) {
				header.label = getFormattedDate(header.label, 'year')
			} else if (areFirstOfMonth) {
				header.label = getFormattedDate(header.label, 'month')
			} else if (areDates) {
				header.label = getFormattedDate(header.label, 'day')
			}
		}
	}

	return groupedHeaders
}

function areFirstDayOfMonth(data: string[]) {
	const firstDayOfMonth = (date: string) => new Date(date).getDate() === 1
	return data.map(firstDayOfMonth).filter(Boolean).length / data.length >= 0.5
}

function areFirstDayOfYear(data: string[]) {
	const firstDayOfYear = (date: string) =>
		new Date(date).getMonth() === 0 && new Date(date).getDate() === 1
	return data.map(firstDayOfYear).filter(Boolean).length / data.length >= 0.5
}

function areValidDates(data: string[]) {
	return data.map(isValidDate).filter(Boolean).length / data.length >= 0.5
}

function isValidDate(value: string) {
	return !isNaN(new Date(value).getTime())
}
