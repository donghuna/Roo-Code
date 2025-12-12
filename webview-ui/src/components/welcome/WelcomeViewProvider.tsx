import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounce } from "react-use"
import {
	VSCodeLink,
	VSCodeProgressRing,
	VSCodeRadio,
	VSCodeRadioGroup,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { validateApiConfiguration } from "@src/utils/validate"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button } from "@src/components/ui"

import ApiOptions from "../settings/ApiOptions"
import { Tab, TabContent } from "../common/Tab"

import RooHero from "./RooHero"
import { Trans } from "react-i18next"
import { ArrowLeft, ArrowRight, BadgeInfo } from "lucide-react"

type ProviderOption = "roo" | "roo-token" | "custom"

const WelcomeViewProvider = () => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme, cloudIsAuthenticated } =
		useExtensionState()
	const { t } = useAppTranslation()
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
	const [selectedProvider, setSelectedProvider] = useState<ProviderOption>("roo")
	const [authInProgress, setAuthInProgress] = useState(false)
	const [showManualEntry, setShowManualEntry] = useState(false)
	const [manualUrl, setManualUrl] = useState("")
	const [manualErrorMessage, setManualErrorMessage] = useState<boolean | undefined>(undefined)
	const manualUrlInputRef = useRef<HTMLInputElement | null>(null)
	
	// Token-based provider state
	const [rooToken, setRooToken] = useState("")
	const [isLoadingModels, setIsLoadingModels] = useState(false)
	const [availableModels, setAvailableModels] = useState<Record<string, any>>({})
	const [selectedModelId, setSelectedModelId] = useState<string>("")
	const [tokenErrorMessage, setTokenErrorMessage] = useState<string | undefined>(undefined)
	const tokenInputRef = useRef<HTMLInputElement | null>(null)

	// When auth completes during the provider signup flow, save the Roo config
	// This will cause showWelcome to become false and navigate to chat
	useEffect(() => {
		if (cloudIsAuthenticated && authInProgress) {
			// Auth completed from provider signup flow - save the config now
			const rooConfig: ProviderSettings = {
				apiProvider: "roo",
			}
			vscode.postMessage({
				type: "upsertApiConfiguration",
				text: currentApiConfigName,
				apiConfiguration: rooConfig,
			})
			setAuthInProgress(false)
			setShowManualEntry(false)
		}
	}, [cloudIsAuthenticated, authInProgress, currentApiConfigName])

	// Focus the manual URL input when it becomes visible
	useEffect(() => {
		if (showManualEntry && manualUrlInputRef.current) {
			setTimeout(() => {
				manualUrlInputRef.current?.focus()
			}, 50)
		}
	}, [showManualEntry])

	// Focus the token input when roo-token option is selected
	useEffect(() => {
		if (selectedProvider === "roo-token" && tokenInputRef.current) {
			setTimeout(() => {
				tokenInputRef.current?.focus()
			}, 50)
		}
	}, [selectedProvider])

	// Memoize the setApiConfigurationField function to pass to ApiOptions
	const setApiConfigurationFieldForApiOptions = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setApiConfiguration({ [field]: value })
		},
		[setApiConfiguration], // setApiConfiguration from context is stable
	)

	const handleGetStarted = useCallback(() => {
		if (selectedProvider === "roo") {
			// Trigger cloud sign-in with provider signup flow
			// NOTE: We intentionally do NOT save the API configuration yet.
			// The configuration will be saved by the extension after auth completes.
			// This keeps showWelcome true so we can show the waiting state.
			vscode.postMessage({ type: "rooCloudSignIn", useProviderSignup: true })

			// Show the waiting state
			setAuthInProgress(true)
		} else if (selectedProvider === "roo-token") {
			// Token-based provider - validate token and model selection
			if (!rooToken.trim()) {
				setTokenErrorMessage("Please enter a token")
				return
			}

			if (!selectedModelId) {
				setTokenErrorMessage("Please select a model")
				return
			}

			setTokenErrorMessage(undefined)
			
			// Save configuration with token and selected model
			const rooTokenConfig: ProviderSettings = {
				apiProvider: "roo",
				apiModelId: selectedModelId,
				// Note: We'll need to handle token storage separately
				// For now, we'll save the config and handle token in backend
			}
			
			vscode.postMessage({ 
				type: "upsertApiConfiguration", 
				text: currentApiConfigName, 
				apiConfiguration: rooTokenConfig,
				// Include token in values for backend to handle
				values: { token: rooToken.trim() },
			})
		} else {
			// Use custom provider - validate first
			const error = apiConfiguration ? validateApiConfiguration(apiConfiguration) : undefined

			if (error) {
				setErrorMessage(error)
				return
			}

			setErrorMessage(undefined)
			vscode.postMessage({ type: "upsertApiConfiguration", text: currentApiConfigName, apiConfiguration })
		}
	}, [selectedProvider, apiConfiguration, currentApiConfigName, rooToken, selectedModelId])

	const handleGoBack = useCallback(() => {
		setAuthInProgress(false)
		setShowManualEntry(false)
		setManualUrl("")
		setManualErrorMessage(false)
	}, [])

	const handleManualUrlChange = (e: any) => {
		const url = e.target.value
		setManualUrl(url)

		// Auto-trigger authentication when a complete URL is pasted
		setTimeout(() => {
			if (url.trim() && url.includes("://") && url.includes("/auth/clerk/callback")) {
				setManualErrorMessage(false)
				vscode.postMessage({ type: "rooCloudManualUrl", text: url.trim() })
			}
		}, 100)
	}

	const handleSubmit = useCallback(() => {
		const url = manualUrl.trim()
		if (url && url.includes("://") && url.includes("/auth/clerk/callback")) {
			setManualErrorMessage(false)
			vscode.postMessage({ type: "rooCloudManualUrl", text: url })
		} else {
			setManualErrorMessage(true)
		}
	}, [manualUrl])

	const handleOpenSignupUrl = () => {
		vscode.postMessage({ type: "rooCloudSignIn", useProviderSignup: true })
	}

	// Handle token input change
	const handleTokenChange = useCallback((e: any) => {
		const token = e.target.value
		setRooToken(token)
		setTokenErrorMessage(undefined)
	}, [])

	// Debounced token validation and model fetching
	useDebounce(
		() => {
			if (rooToken.trim().length > 0) {
				setIsLoadingModels(true)
				// Request models from backend using the token
				vscode.postMessage({
					type: "requestRooModelsWithToken",
					token: rooToken.trim(),
				})
			} else {
				setAvailableModels({})
				setSelectedModelId("")
				setIsLoadingModels(false)
			}
		},
		500, // 500ms debounce delay
		[rooToken],
	)

	// Listen for model fetch response
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			
			if (message.type === "rooModelsWithTokenResponse") {
				setIsLoadingModels(false)
				if (message.success) {
					setAvailableModels(message.models || {})
					setTokenErrorMessage(undefined)
					// Auto-select first model if available
					if (message.models && Object.keys(message.models).length > 0 && !selectedModelId) {
						const firstModelId = Object.keys(message.models)[0]
						setSelectedModelId(firstModelId)
					}
				} else {
					setTokenErrorMessage(message.error || "Failed to fetch models")
					setAvailableModels({})
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [selectedModelId])

	// Render the waiting for cloud state
	if (authInProgress) {
		return (
			<Tab>
				<TabContent className="flex flex-col gap-4 p-6">
					<div className="flex flex-col items-start gap-4 pt-8">
						<VSCodeProgressRing className="size-6" />
						<h2 className="mt-0 mb-0 text-lg font-semibold">{t("welcome:waitingForCloud.heading")}</h2>
						<p className="text-vscode-descriptionForeground mt-0">
							{t("welcome:waitingForCloud.description")}
						</p>

						<div className="flex gap-2 items-start pr-4 text-vscode-descriptionForeground">
							<BadgeInfo className="size-4 inline shrink-0" />
							<p className="m-0">
								<Trans
									i18nKey="welcome:waitingForCloud.noPrompt"
									components={{
										clickHere: (
											<button
												onClick={handleOpenSignupUrl}
												className="text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground underline cursor-pointer bg-transparent border-none p-0"
											/>
										),
									}}
								/>
							</p>
						</div>

						<div className="flex gap-2 items-start pr-4 text-vscode-descriptionForeground">
							<ArrowRight className="size-4 inline shrink-0" />
							<div>
								<p className="m-0">
									<Trans
										i18nKey="welcome:waitingForCloud.havingTrouble"
										components={{
											clickHere: (
												<button
													onClick={() => setShowManualEntry(true)}
													className="text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground underline cursor-pointer bg-transparent border-none p-0	"
												/>
											),
										}}
									/>
								</p>

								{showManualEntry && (
									<div className="w-full max-w-sm">
										<p className="text-vscode-descriptionForeground">
											{t("welcome:waitingForCloud.pasteUrl")}
										</p>
										<div className="flex gap-2 items-center">
											<VSCodeTextField
												ref={manualUrlInputRef as any}
												value={manualUrl}
												onKeyUp={handleManualUrlChange}
												placeholder="vscode://RooVeterinaryInc.roo-cline/auth/clerk/callback?state=..."
												className="flex-1"
											/>
											<Button
												onClick={handleSubmit}
												disabled={manualUrl.length < 40}
												variant="secondary">
												<ArrowRight className="size-4" />
											</Button>
										</div>
										{manualUrl && manualErrorMessage && (
											<p className="text-vscode-errorForeground mt-2">
												{t("welcome:waitingForCloud.invalidURL")}
											</p>
										)}
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="mt-4">
						<Button onClick={handleGoBack} variant="secondary">
							<ArrowLeft className="size-4" />
							{t("welcome:waitingForCloud.goBack")}
						</Button>
					</div>
				</TabContent>
			</Tab>
		)
	}

	return (
		<Tab>
			<TabContent className="flex flex-col gap-4 p-6 justify-center">
				<RooHero />
				<h2 className="mt-0 mb-0 text-xl">{t("welcome:greeting")}</h2>

				<div className="text-base text-vscode-foreground space-y-3">
					{selectedProvider === "roo" && (
						<p>
							<Trans i18nKey="welcome:introduction" />
						</p>
					)}
					<p>
						<Trans i18nKey="welcome:chooseProvider" />
					</p>
				</div>

				<div className="mb-4">
					<VSCodeRadioGroup
						value={selectedProvider}
						onChange={(e: Event | React.FormEvent<HTMLElement>) => {
							const target = ((e as CustomEvent)?.detail?.target ||
								(e.target as HTMLInputElement)) as HTMLInputElement
							setSelectedProvider(target.value as ProviderOption)
						}}>
						{/* Roo Code Cloud Provider Option */}
						<VSCodeRadio value="roo" className="flex items-start gap-2">
							<div className="flex-1 space-y-1 cursor-pointer">
								<p className="text-lg font-semibold block -mt-1">
									{t("welcome:providerSignup.rooCloudProvider")}
								</p>
								<p className="text-base text-vscode-descriptionForeground mt-0">
									{t("welcome:providerSignup.rooCloudDescription")} (
									<VSCodeLink
										href="https://roocode.com/provider/pricing?utm_source=extension&utm_medium=welcome-screen&utm_campaign=provider-signup&utm_content=learn-more"
										className="cursor-pointer">
										{t("welcome:providerSignup.learnMore")}
									</VSCodeLink>
									).
								</p>
							</div>
						</VSCodeRadio>

						{/* Roo Token Provider Option */}
						<VSCodeRadio value="roo-token" className="flex items-start gap-2">
							<div className="flex-1 space-y-1 cursor-pointer">
								<p className="text-lg font-semibold block -mt-1">
									{t("welcome:providerSignup.rooTokenProvider") || "Use Roo Token"}
								</p>
								<p className="text-base text-vscode-descriptionForeground mt-0">
									{t("welcome:providerSignup.rooTokenDescription") || "Enter your Roo token to access available models."}
								</p>
							</div>
						</VSCodeRadio>

						{/* Use Another Provider Option */}
						<VSCodeRadio value="custom" className="flex items-start gap-2">
							<div className="flex-1 space-y-1 cursor-pointer">
								<p className="text-lg font-semibold block -mt-1">
									{t("welcome:providerSignup.useAnotherProvider")}
								</p>
								<p className="text-base text-vscode-descriptionForeground mt-0">
									{t("welcome:providerSignup.useAnotherProviderDescription")}
								</p>
							</div>
						</VSCodeRadio>
					</VSCodeRadioGroup>

					{/* Token input section for roo-token provider - appears right below the radio button */}
					{selectedProvider === "roo-token" && (
						<div className="border-l-2 border-vscode-panel-border pl-6 ml-[7px] mt-2 mb-4">
							<div className="flex flex-col gap-4 mt-4">
								<div>
									<label className="block font-medium mb-2">
										{t("welcome:providerSignup.tokenLabel") || "Roo Token"}
									</label>
									<VSCodeTextField
										ref={tokenInputRef as any}
										value={rooToken}
										onInput={handleTokenChange}
										placeholder={t("welcome:providerSignup.tokenPlaceholder") || "Enter your Roo token"}
										className="w-full"
										type="password"
									/>
									{tokenErrorMessage && (
										<p className="text-vscode-errorForeground mt-2 text-sm">{tokenErrorMessage}</p>
									)}
								</div>

								{isLoadingModels && (
									<div className="flex items-center gap-2">
										<VSCodeProgressRing className="size-4" />
										<p className="text-sm text-vscode-descriptionForeground">
											{t("welcome:providerSignup.loadingModels") || "Loading models..."}
										</p>
									</div>
								)}

								{Object.keys(availableModels).length > 0 && (
									<div>
										<label className="block font-medium mb-2">
											{t("welcome:providerSignup.selectModel") || "Select Model"}
										</label>
										<select
											value={selectedModelId}
											onChange={(e) => {
												setSelectedModelId(e.target.value)
												setTokenErrorMessage(undefined)
											}}
											className="w-full p-2 border border-vscode-input-border bg-vscode-input-background text-vscode-input-foreground rounded">
											<option value="">{t("welcome:providerSignup.selectModelPlaceholder") || "Select a model"}</option>
											{Object.entries(availableModels).map(([modelId, modelInfo]: [string, any]) => (
												<option key={modelId} value={modelId}>
													{modelId} {modelInfo.description ? `- ${modelInfo.description}` : ""}
												</option>
											))}
										</select>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Expand API options only when custom provider is selected */}
					{selectedProvider === "custom" && (
						<div className="border-l-2 border-vscode-panel-border pl-6 ml-[7px] mt-2 mb-4">
							<div className="mt-4">
								<p className="text-base text-vscode-descriptionForeground mt-0">
									{t("welcome:providerSignup.noApiKeys")}
								</p>
								<ApiOptions
									fromWelcomeView
									apiConfiguration={apiConfiguration || {}}
									uriScheme={uriScheme}
									setApiConfigurationField={setApiConfigurationFieldForApiOptions}
									errorMessage={errorMessage}
									setErrorMessage={setErrorMessage}
								/>
							</div>
						</div>
					)}
				</div>

				<div className="-mt-8">
					<Button 
						onClick={handleGetStarted} 
						variant="primary"
						disabled={selectedProvider === "roo-token" && (!rooToken.trim() || !selectedModelId)}>
						{t("welcome:providerSignup.getStarted")} →
					</Button>
				</div>
			</TabContent>
		</Tab>
	)
}

export default WelcomeViewProvider
