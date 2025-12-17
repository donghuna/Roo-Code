import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { Check, X } from "lucide-react"
import { VSCodeProgressRing, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings, ModelInfo } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { openAiModelInfoSaneDefaults } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { DecoratedVSCodeTextField } from "@src/components/common/DecoratedVSCodeTextField"
import { vscode } from "@src/utils/vscode"

import { inputEventTransform } from "../transforms"

type ValidationStatus = "idle" | "validating" | "valid" | "invalid"

type CodeMateProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	simplifySettings?: boolean
}

export const CodeMate = ({ apiConfiguration, setApiConfigurationField }: CodeMateProps) => {
	const { t } = useAppTranslation()
	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const apiConfigurationRef = useRef(apiConfiguration)
	const lastValidatedKeyRef = useRef<string | null>(null)
	const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle")
	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)

	// Keep apiConfigurationRef in sync with apiConfiguration
	useEffect(() => {
		apiConfigurationRef.current = apiConfiguration
	}, [apiConfiguration])

	// Re-validate token when apiConfiguration.openAiApiKey changes externally (e.g., when model is selected)
	useEffect(() => {
		const currentApiKey = apiConfiguration?.openAiApiKey

		// Skip if this is the same key we just validated (to avoid infinite loops)
		if (currentApiKey === lastValidatedKeyRef.current) {
			return
		}

		// Only validate if there's an API key, we're not currently validating, and status is not already valid
		// This prevents re-validation when handleInputChange already validated the token
		if (
			currentApiKey &&
			validationStatus !== "validating" &&
			validationStatus !== "valid" &&
			validationStatus !== "idle"
		) {
			// Request models from extension to validate the token
			setValidationStatus("validating")
			lastValidatedKeyRef.current = currentApiKey

			const currentConfig = apiConfigurationRef.current
			if (currentConfig?.openAiBaseUrl) {
				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: currentConfig.openAiBaseUrl,
						apiKey: currentApiKey,
						customHeaders: {},
						openAiHeaders: {},
					},
				})
			} else {
				// No base URL configured
				setValidationStatus("invalid")
				setOpenAiModels(null)
			}
		} else if (!currentApiKey && validationStatus !== "idle") {
			// API key was cleared
			setValidationStatus("idle")
			setOpenAiModels(null)
			lastValidatedKeyRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apiConfiguration?.openAiApiKey])

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				const value = transform(event as E)

				// Reset validation status when user starts typing
				if (field === "openAiApiKey") {
					setValidationStatus("idle")
				}

				// Clear existing timeout
				if (debounceTimeoutRef.current) {
					clearTimeout(debounceTimeoutRef.current)
				}

				// Set new timeout to debounce the update
				debounceTimeoutRef.current = setTimeout(() => {
					setApiConfigurationField(field, value)

					// Validate CodeMate API Key after debounce
					if (field === "openAiApiKey") {
						if (!value) {
							setValidationStatus("idle")
							setOpenAiModels(null)
							lastValidatedKeyRef.current = null
							return
						}

						setValidationStatus("validating")

						// Update lastValidatedKeyRef to track which token we're validating
						const tokenValue = value as string
						lastValidatedKeyRef.current = tokenValue

						// Request models from extension to validate the token
						// Use ref to get the latest value without causing re-renders
						const currentConfig = apiConfigurationRef.current
						if (currentConfig?.openAiBaseUrl) {
							vscode.postMessage({
								type: "requestOpenAiModels",
								values: {
									baseUrl: currentConfig.openAiBaseUrl,
									apiKey: tokenValue,
									customHeaders: {},
									openAiHeaders: {},
								},
							})
						} else {
							// No base URL configured
							setValidationStatus("invalid")
							setOpenAiModels(null)
						}
					}
				}, 500) // 500ms debounce delay
			},
		[setApiConfigurationField],
	)

	// Listen for model updates from extension
	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "openAiModels": {
				const updatedModels = message.openAiModels ?? []
				const currentApiKey = apiConfigurationRef.current?.openAiApiKey

				// Only process if this is for the token we're currently validating
				if (currentApiKey && currentApiKey === lastValidatedKeyRef.current) {
					if (updatedModels.length > 0) {
						// Valid token - models were returned
						setValidationStatus("valid")
						setOpenAiModels(
							Object.fromEntries(updatedModels.map((item) => [item, openAiModelInfoSaneDefaults])),
						)
					} else {
						// Invalid token - no models returned
						setValidationStatus("invalid")
						setOpenAiModels(null)
					}
				}
				break
			}
		}
	}, [])

	useEvent("message", onMessage)

	// Cleanup timeouts on unmount
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current)
			}
			if (validationTimeoutRef.current) {
				clearTimeout(validationTimeoutRef.current)
			}
		}
	}, [])

	const getRightNodes = () => {
		if (validationStatus === "validating") {
			return [<VSCodeProgressRing key="validating" className="size-4" />]
		}
		if (validationStatus === "valid") {
			return [<Check key="valid" className="size-4 text-vscode-textLink-foreground" />]
		}
		if (validationStatus === "invalid") {
			return [<X key="invalid" className="size-4 text-vscode-errorForeground" />]
		}
		return undefined
	}

	return (
		<>
			<label className="block font-medium mb-0">{t("settings:providers.codemateApiKey")}</label>
			<DecoratedVSCodeTextField
				value={apiConfiguration?.openAiApiKey || ""}
				type="password"
				onInput={handleInputChange("openAiApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full"
				rightNodes={getRightNodes()}
			/>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			<VSCodeButtonLink href="https://codemate.samsungds.net/token" appearance="secondary">
				{t("settings:providers.getCodeMateApiKey")}
			</VSCodeButtonLink>
			{validationStatus === "valid" && openAiModels && Object.keys(openAiModels).length > 0 && (
				<div className="mt-4">
					<label className="block font-medium mb-1">Model</label>
					<VSCodeDropdown
						value={apiConfiguration?.openAiModelId || ""}
						onChange={(e) => {
							const target = e.target as HTMLSelectElement
							setApiConfigurationField("openAiModelId", target.value)
						}}
						className="w-full">
						{Object.keys(openAiModels).map((modelId) => (
							<VSCodeOption key={modelId} value={modelId}>
								{modelId}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</div>
			)}
		</>
	)
}
