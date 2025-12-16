import { useCallback, useEffect, useRef, useState } from "react"
import { useEvent } from "react-use"
import { Check, X } from "lucide-react"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings, ModelInfo } from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { openAiModelInfoSaneDefaults } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { DecoratedVSCodeTextField } from "@src/components/common/DecoratedVSCodeTextField"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
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
			const validTestTokens = ["test", "valid-token", "codemate-test"]

			// Validate the current API key
			if (validTestTokens.includes(currentApiKey)) {
				setValidationStatus("valid")
				// Set test models if valid
				const testModels = {
					"gpt-4o": openAiModelInfoSaneDefaults,
					"gpt-4o-mini": openAiModelInfoSaneDefaults,
					"gpt-4-turbo": openAiModelInfoSaneDefaults,
					"gpt-3.5-turbo": openAiModelInfoSaneDefaults,
				}
				setOpenAiModels(testModels)
				lastValidatedKeyRef.current = currentApiKey
			} else {
				// Invalid token
				setValidationStatus("invalid")
				setOpenAiModels(null)
				lastValidatedKeyRef.current = currentApiKey
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

					// Validate CodeMate API Key after debounce (TEST MODE: Only specific values succeed)
					if (field === "openAiApiKey") {
						if (!value) {
							setValidationStatus("idle")
							setOpenAiModels(null)
							return
						}

						setValidationStatus("validating")

						// Clear existing validation timeout
						if (validationTimeoutRef.current) {
							clearTimeout(validationTimeoutRef.current)
						}

						// Simulate validation delay
						validationTimeoutRef.current = setTimeout(() => {
							// TEST MODE: Only allow specific test token values
							const validTestTokens = ["test", "valid-token", "codemate-test"]
							const tokenValue = value as string

							if (validTestTokens.includes(tokenValue)) {
								// Valid token - set to valid
								setValidationStatus("valid")

								// TEST MODE: Set test models data
								const testModels = {
									"gpt-4o": openAiModelInfoSaneDefaults,
									"gpt-4o-mini": openAiModelInfoSaneDefaults,
									"gpt-4-turbo": openAiModelInfoSaneDefaults,
									"gpt-3.5-turbo": openAiModelInfoSaneDefaults,
								}
								setOpenAiModels(testModels)

								// Update lastValidatedKeyRef to prevent re-validation
								lastValidatedKeyRef.current = tokenValue

								// If validation passes (no error), fetch models
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
								}
							} else {
								// Invalid token - set to invalid
								setValidationStatus("invalid")
								setOpenAiModels(null)
								lastValidatedKeyRef.current = tokenValue
							}
						}, 1000) // Simulate 1 second validation delay
					}
				}, 500) // 500ms debounce delay
			},
		[setApiConfigurationField],
	)

	// Listen for model updates from extension
	// Disabled in test mode to prevent empty model list from extension overwriting test data
	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		// switch (message.type) {
		// 	case "openAiModels": {
		// 		const updatedModels = message.openAiModels ?? []
		// 		setOpenAiModels(Object.fromEntries(updatedModels.map((item) => [item, openAiModelInfoSaneDefaults])))
		// 		break
		// 	}
		// }
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
			<label className="block font-medium mb-0">{t("settings:codemateApiKey")}</label>
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
					<Select
						value={apiConfiguration?.openAiModelId || ""}
						onValueChange={(value) => setApiConfigurationField("openAiModelId", value)}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={t("settings:common.select")} />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(openAiModels).map((modelId) => (
								<SelectItem key={modelId} value={modelId}>
									{modelId}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</>
	)
}
