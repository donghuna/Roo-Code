import { useCallback, useEffect, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { DecoratedVSCodeTextField } from "@src/components/common/DecoratedVSCodeTextField"
import { vscode } from "@src/utils/vscode"
import { validateApiConfiguration } from "@src/utils/validate"

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
	const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle")

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

					// Validate token after debounce
					if (field === "openAiApiKey") {
						if (!value) {
							setValidationStatus("idle")
							return
						}

						setValidationStatus("validating")

						const configToValidate: ProviderSettings = {
							...apiConfiguration,
							openAiApiKey: value as string,
						}

						const validationError = validateApiConfiguration(configToValidate)

						if (validationError) {
							setValidationStatus("invalid")
						} else {
							setValidationStatus("valid")

							// If validation passes (no error), fetch models
							if (apiConfiguration?.openAiBaseUrl) {
								vscode.postMessage({
									type: "requestOpenAiModels",
									values: {
										baseUrl: apiConfiguration.openAiBaseUrl,
										apiKey: value as string,
										customHeaders: {},
										openAiHeaders: {},
									},
								})
							}
						}
					}
				}, 500) // 500ms debounce delay
			},
		[setApiConfigurationField, apiConfiguration],
	)

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current)
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
			<DecoratedVSCodeTextField
				value={apiConfiguration?.openAiApiKey || ""}
				type="password"
				onInput={handleInputChange("openAiApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full"
				rightNodes={getRightNodes()}>
				<label className="block font-medium mb-1">{t("settings:providers.openAiApiKey")}</label>
			</DecoratedVSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			<VSCodeButtonLink href="https://codemate.samsungds.net/token" appearance="secondary">
				{t("settings:providers.getCodeMateApiKey")}
			</VSCodeButtonLink>
		</>
	)
}
