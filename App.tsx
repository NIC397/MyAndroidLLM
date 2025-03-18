import React, { useState, useRef, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

import Markdown from "react-native-markdown-display";

import { initLlama, releaseAllLlama } from "llama.rn"; // Import llama.rn
import { downloadModel } from "./src/api/model"; // Download function
import ProgressBar from "./src/components/ProgressBar"; // Progress bar component
import RNFS from "react-native-fs"; // File system module
import axios from "axios";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string; // Single thought block
  showThought?: boolean;
};

// New type for model metadata
type ModelMetadata = {
  filename: string;
  format: string;
  downloadDate: string;
  size?: number; // Add size property in bytes
};

function App(): React.JSX.Element {
  const INITIAL_CONVERSATION: Message[] = [
    {
      role: "system",
      content:
        "This is a conversation between user and assistant, a friendly chatbot.",
    },
  ];
  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] =
    useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]); // List of .gguf files
  const [currentPage, setCurrentPage] = useState<
    "modelSelection" | "conversation"
  >("modelSelection"); // Navigation state
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  // New state for storing model metadata
  const [modelMetadata, setModelMetadata] = useState<ModelMetadata[]>([]);

  const modelFormats = [
    { label: "Llama-3.2-1B-Instruct" },
    { label: "Qwen2-0.5B-Instruct" },
    { label: "DeepSeek-R1-Distill-Qwen-1.5B" },
    { label: "SmolLM2-1.7B-Instruct" },
  ];

  const HF_TO_GGUF = {
    "Llama-3.2-1B-Instruct": "medmekk/Llama-3.2-1B-Instruct.GGUF",
    "DeepSeek-R1-Distill-Qwen-1.5B":
      "medmekk/DeepSeek-R1-Distill-Qwen-1.5B.GGUF",
    "Qwen2-0.5B-Instruct": "medmekk/Qwen2.5-0.5B-Instruct.GGUF",
    "SmolLM2-1.7B-Instruct": "medmekk/SmolLM2-1.7B-Instruct.GGUF",
  };

  // To handle the scroll view
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);

  // Path for model metadata file
  const METADATA_FILE_PATH = `${RNFS.DocumentDirectoryPath}/model_metadata.json`;

  // Load model metadata from file on app start
  useEffect(() => {
    const loadModelMetadata = async () => {
      try {
        const exists = await RNFS.exists(METADATA_FILE_PATH);
        if (exists) {
          const metadataString = await RNFS.readFile(METADATA_FILE_PATH, 'utf8');
          const metadata = JSON.parse(metadataString) as ModelMetadata[];
          setModelMetadata(metadata);
          console.log("Loaded model metadata:", metadata);
        }
      } catch (error) {
        console.error("Error loading model metadata:", error);
      }
    };

    loadModelMetadata();
  }, []);

  // Save model metadata to file whenever it changes
  useEffect(() => {
    const saveModelMetadata = async () => {
      try {
        await RNFS.writeFile(
          METADATA_FILE_PATH,
          JSON.stringify(modelMetadata),
          'utf8'
        );
        console.log("Saved model metadata:", modelMetadata);
      } catch (error) {
        console.error("Error saving model metadata:", error);
      }
    };

    if (modelMetadata.length > 0) {
      saveModelMetadata();
    }
  }, [modelMetadata]);

  const handleGGUFSelection = (file: string) => {
    setSelectedGGUF(file);
    Alert.alert(
      "Confirm Download",
      `Do you want to download ${file} ?`,
      [
        {
          text: "No",
          onPress: () => setSelectedGGUF(null),
          style: "cancel",
        },
        { text: "Yes", onPress: () => handleDownloadAndNavigate(file) },
      ],
      { cancelable: false }
    );
  };

  const handleDownloadAndNavigate = async (file: string) => {
    await handleDownloadModel(file);
    setCurrentPage("conversation"); // Navigate to conversation after download
  };

  const handleBackToModelSelection = () => {
    setContext(null);
    releaseAllLlama();
    setConversation(INITIAL_CONVERSATION);
    setSelectedGGUF(null);
    setTokensPerSecond([]);
    setCurrentPage("modelSelection");
  };

  const toggleThought = (messageIndex: number) => {
    setConversation((prev) =>
      prev.map((msg, index) =>
        index === messageIndex ? { ...msg, showThought: !msg.showThought } : msg
      )
    );
  };

  // Updated to categorize models by format
  const fetchAvailableGGUFs = async (modelFormat: string) => {
    setIsFetching(true);
    console.log(HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]);
    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${
          HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]
        }`
      );
      console.log(response);
      const files = response.data.siblings.filter((file: any) =>
        file.rfilename.endsWith(".gguf")
      );
      setAvailableGGUFs(files.map((file: any) => file.rfilename));
    } catch (error) {
      // In case of network error, filter and show only models of the selected format
      const filteredModels = modelMetadata
        .filter(model => model.format === modelFormat)
        .map(model => model.filename);

      setAvailableGGUFs(filteredModels);

      console.log("Network error, showing downloaded models for format:", modelFormat);
      console.log("Filtered models:", filteredModels);

      Alert.alert(
        "Network Error",
        `Using locally downloaded ${modelFormat} models only.`
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleFormatSelection = async (format: string) => {
    console.log("Format selected:", format);
    setSelectedModelFormat(format);
    setAvailableGGUFs([]); // Clear previous list

    // Try to fetch models from network
    try {
      console.log("Attempting to fetch models from network...");
      const response = await axios.get(
        `https://huggingface.co/api/models/${HF_TO_GGUF[format]}`
      );
      console.log("Network request successful, data received:", response.data);
      const files = response.data.siblings.filter((file: any) =>
        file.rfilename.endsWith(".gguf")
      );
      console.log("Filtered GGUF files:", files);
      const ggufFiles = files.map((file: any) => file.rfilename);
      setAvailableGGUFs(ggufFiles); // Update availableGGUFs
    } catch (error) {
      console.log("Network request failed, using local models...");

      // Filter models that belong to the selected format
      const filteredModels = modelMetadata
        .filter(model => model.format === format)
        .map(model => model.filename);

      console.log("Filtered local models for format", format, ":", filteredModels);
      setAvailableGGUFs(filteredModels);
    }
  };

  // 5. Update checkDownloadedModels to capture sizes of existing models
  useEffect(() => {
    const checkDownloadedModels = async () => {
      try {
        const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const ggufFiles = files
          .filter((file) => file.name.endsWith(".gguf"))
          .map((file) => file.name);

        setDownloadedModels(ggufFiles);

        // For each downloaded model not in metadata, add it with unknown format
        const existingFilenames = modelMetadata.map(m => m.filename);
        const newFiles = ggufFiles.filter(file => !existingFilenames.includes(file));

        if (newFiles.length > 0) {
          // Get file sizes for each new file
          const newMetadataPromises = newFiles.map(async filename => {
            // Try to infer format from filename
            let format = "Unknown";

            if (filename.includes("Llama-3.2") || filename.includes("llama-3.2")) {
              format = "Llama-3.2-1B-Instruct";
            } else if (filename.includes("Qwen2") || filename.includes("qwen2")) {
              format = "Qwen2-0.5B-Instruct";
            } else if (filename.includes("DeepSeek") || filename.includes("deepseek")) {
              format = "DeepSeek-R1-Distill-Qwen-1.5B";
            } else if (filename.includes("SmolLM") || filename.includes("smollm")) {
              format = "SmolLM2-1.7B-Instruct";
            }

            // Get file size
            let size: number | undefined;
            try {
              const fileInfo = await RNFS.stat(`${RNFS.DocumentDirectoryPath}/${filename}`);
              size = fileInfo.size;
            } catch (error) {
              console.error(`Error getting size for ${filename}:`, error);
            }

            return {
              filename,
              format,
              downloadDate: new Date().toISOString(),
              size
            };
          });

          const newMetadata = await Promise.all(newMetadataPromises);
          setModelMetadata(prev => [...prev, ...newMetadata]);
        }
      } catch (error) {
        console.error("Error checking downloaded models:", error);
      }
    };

    checkDownloadedModels();
  }, []);

  const checkFileExists = async (filePath: string) => {
    try {
      const fileExists = await RNFS.exists(filePath);
      console.log("File exists:", fileExists);
      return fileExists;
    } catch (error) {
      console.error("Error checking file existence:", error);
      return false;
    }
  };

  const handleScroll = (event: any) => {
    const currentPosition = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

    // Store current scroll position and content height
    scrollPositionRef.current = currentPosition;
    contentHeightRef.current = contentHeight;

    // If user has scrolled up more than 100px from bottom, disable auto-scroll
    const distanceFromBottom =
      contentHeight - scrollViewHeight - currentPosition;
    setAutoScrollEnabled(distanceFromBottom < 100);
  };

  // Updated to save model metadata
  const handleDownloadModel = async (file: string) => {
    const downloadUrl = `https://huggingface.co/${
      HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
    }/resolve/main/${file}`;
    setIsDownloading(true);
    setProgress(0);

    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    if (await checkFileExists(destPath)) {
      // Get file size for existing file
      try {
        const fileInfo = await RNFS.stat(destPath);
        console.log("NIC397 - fileInfo: ", fileInfo)

        // Update metadata with file size if not already set
        setModelMetadata(prevMetadata => {
          const updatedMetadata = [...prevMetadata];
          const existingIndex = updatedMetadata.findIndex(m => m.filename === file);
          if (existingIndex >= 0 && !updatedMetadata[existingIndex].size) {
            updatedMetadata[existingIndex] = {
              ...updatedMetadata[existingIndex],
              size: fileInfo.size
            };
          }
          return updatedMetadata;
        });
      } catch (error) {
        console.error("Error getting file stats:", error);
      }

      const success = await loadModel(file);
      if (success) {
        Alert.alert(
          "Info",
          `File ${destPath} already exists, we will load it directly.`
        );
        setIsDownloading(false);
        return;
      }
    }

    try {
      console.log("Starting download...");
      console.log("Download status:", isDownloading);

      const destPath = await downloadModel(file, downloadUrl, (progress) =>
        setProgress(progress)
      );

      // Get file size after download
      const fileInfo = await RNFS.stat(destPath);
      const fileSize = fileInfo.size;

      // Add model metadata with size
      const newMetadata: ModelMetadata = {
        filename: file,
        format: selectedModelFormat,
        downloadDate: new Date().toISOString(),
        size: fileSize
      };

      // Update metadata state
      setModelMetadata(prevMetadata => {
        // Check if model already exists in metadata, replace if it does
        const exists = prevMetadata.findIndex(m => m.filename === file);
        if (exists >= 0) {
          const updatedMetadata = [...prevMetadata];
          updatedMetadata[exists] = newMetadata;
          return updatedMetadata;
        }
        return [...prevMetadata, newMetadata];
      });

      // Update downloaded models list
      setDownloadedModels(prev => {
        if (!prev.includes(file)) {
          return [...prev, file];
        }
        return prev;
      });

      Alert.alert("Success", `Model downloaded to: ${destPath}`);

      // After downloading, load the model
      await loadModel(file);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Download failed: ${errorMessage}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const stopGeneration = async () => {
    try {
      await context.stopCompletion();
      setIsGenerating(false);
      setIsLoading(false);

      setConversation((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + "\n\n*Generation stopped by user*",
            },
          ];
        }
        return prev;
      });
    } catch (error) {
      console.error("Error stopping completion:", error);
    }
  };

  // Add this state for error messages
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Add a new state for model loading
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);

  const loadModel = async (modelName: string) => {
    try {
      setIsModelLoading(true); // Start the loading state
      const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
      console.log("Loading model from path:", destPath);

      if (context) {
        await releaseAllLlama();
        setContext(null);
        setConversation(INITIAL_CONVERSATION);
      }

      const llamaContext = await initLlama({
        model: destPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 1,
      });

      setContext(llamaContext);

      // Update format info if it's unknown
      const modelMeta = modelMetadata.find(m => m.filename === modelName);
      if (modelMeta && modelMeta.format === "Unknown") {
        // Try to infer format from the model's properties or behavior
        setModelMetadata(prev => prev.map(m =>
          m.filename === modelName
            ? {...m, format: selectedModelFormat || m.format}
            : m
        ));
      }

      setIsModelLoading(false);

      return true;
    } catch (error) {
      console.log("Error loading model:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Show error for a few seconds instead of alert
      setModelLoadError(errorMessage);
      setTimeout(() => {
        setModelLoadError(null);
      }, 3000);

      setIsModelLoading(false);
      return false;
    }
  };

  const handleSendMessage = async () => {
    if (!context) {
      Alert.alert("Model Not Loaded", "Please load the model first.");
      return;
    }
    if (!userInput.trim()) {
      Alert.alert("Input Error", "Please enter a message.");
      return;
    }

    const newConversation: Message[] = [
      ...conversation,
      { role: "user", content: userInput },
    ];
    setConversation(newConversation);
    setUserInput("");
    setIsLoading(true);
    setIsGenerating(true);
    setAutoScrollEnabled(true);

    try {
      const stopWords = [
        "</s>",
        "<|end|>",
        "user:",
        "assistant:",
        "<|im_end|>",
        "<|eot_id|>",
        "<|end▁of▁sentence|>",
        "<|end_of_text|>",
        "<｜end▁of▁sentence｜>",
      ];
      const chat = newConversation;

      // Append a placeholder for the assistant's response
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          thought: undefined,
          showThought: false,
        },
      ]);
      let currentAssistantMessage = "";
      let currentThought = "";
      let inThinkBlock = false;
      interface CompletionData {
        token: string;
      }

      interface CompletionResult {
        timings: {
          predicted_per_second: number;
        };
      }

      const result: CompletionResult = await context.completion(
        {
          messages: chat,
          n_predict: 10000,
          stop: stopWords,
        },
        (data: CompletionData) => {
          const token = data.token; // Extract the token
          currentAssistantMessage += token; // Append token to the current message

          if (token.includes("<think>")) {
            inThinkBlock = true;
            currentThought = token.replace("<think>", "");
          } else if (token.includes("</think>")) {
            inThinkBlock = false;
            const finalThought = currentThought.replace("</think>", "").trim();

            setConversation((prev) => {
              const lastIndex = prev.length - 1;
              const updated = [...prev];

              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content.replace(
                  `<think>${finalThought}</think>`,
                  ""
                ),
                thought: finalThought,
              };

              return updated;
            });

            currentThought = "";
          } else if (inThinkBlock) {
            currentThought += token;
          }

          const visibleContent = currentAssistantMessage
            .replace(/<think>.*?<\/think>/gs, "")
            .trim();

          setConversation((prev) => {
            const lastIndex = prev.length - 1;
            const updated = [...prev];
            updated[lastIndex].content = visibleContent;
            return updated;
          });

          if (autoScrollEnabled && scrollViewRef.current) {
            requestAnimationFrame(() => {
              scrollViewRef.current?.scrollToEnd({ animated: false });
            });
          }
        }
      );

      setTokensPerSecond((prev) => [
        ...prev,
        parseFloat(result.timings.predicted_per_second.toFixed(2)),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error During Inference", errorMessage);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  // Get model format display info
  const getModelFormatInfo = (filename: string) => {
    const modelMeta = modelMetadata.find(m => m.filename === filename);
    return modelMeta ? modelMeta.format : "Unknown";
  };

  // Delete a model from the device
  const deleteModel = async (filename: string) => {
    try {
      const filePath = `${RNFS.DocumentDirectoryPath}/${filename}`;
      const exists = await RNFS.exists(filePath);

      if (!exists) {
        Alert.alert("Error", `File ${filename} does not exist.`);
        return;
      }

      // Confirm deletion
      Alert.alert(
        "Confirm Deletion",
        `Are you sure you want to delete ${filename}?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                // Delete the file
                await RNFS.unlink(filePath);

                // Update metadata
                setModelMetadata(prev => prev.filter(m => m.filename !== filename));

                // Update downloaded models list
                setDownloadedModels(prev => prev.filter(m => m !== filename));

                Alert.alert("Success", `Model ${filename} was deleted successfully.`);
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                Alert.alert("Error", `Failed to delete model: ${errorMessage}`);
              }
            },
          },
        ]
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to delete model: ${errorMessage}`);
    }
  };

  // 3. Add a helper function to format file sizes in human-readable format
  const formatFileSize = (bytes: number | undefined): string => {
    if (bytes === undefined) return 'Unknown size';

    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  // 4. Add a function to get model size
  const getModelSize = (filename: string): string => {
    const modelMeta = modelMetadata.find(m => m.filename === filename);
    return formatFileSize(modelMeta?.size);
  };

  // ------------------------------------------
  // OUTPUT: return HTML elements
  return (
    <SafeAreaView style={styles.container}>

      {/* Add loading overlay here */}
      {isModelLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading Model...</Text>
            <Text style={styles.loadingSubtext}>This may take a moment</Text>
          </View>
        </View>
      )}

      {/* Error message that appears temporarily */}
      {modelLoadError && (
        <View style={styles.errorMessageContainer}>
          <Text style={styles.errorMessage}>Error: {modelLoadError}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Text style={styles.title}>My Android LLMs</Text>
          {currentPage === "modelSelection" && !isDownloading && (
            <View style={styles.card}>
              <TouchableOpacity
                  style={[
                    styles.button,
                    !selectedModelFormat && styles.selectedButton,
                    { marginBottom: 12 }  // Add some extra space below this button
                  ]}
                  onPress={() => {
                    setSelectedModelFormat("");  // Clear the selected format
                    setAvailableGGUFs([]);       // Clear available GGUFs
                  }}
                >
                  <View style={styles.modelFormatRow}>
                    <Text style={styles.buttonText}>All Local Models</Text>
                    <View style={styles.modelCountBadge}>
                      <Text style={styles.modelCountText}>{downloadedModels.length}</Text>
                    </View>
                  </View>
              </TouchableOpacity>
              <Text style={styles.subtitle}>Model Filters</Text>
              {modelFormats.map((format) => {
                // Count downloaded models for this format to show badge
                const modelsInFormat = modelMetadata.filter(
                  m => m.format === format.label
                ).length;

                return (
                  <TouchableOpacity
                    key={format.label}
                    style={[
                      styles.button,
                      selectedModelFormat === format.label &&
                        styles.selectedButton,
                    ]}
                    onPress={() => handleFormatSelection(format.label)}
                  >
                    <View style={styles.modelFormatRow}>
                      <Text style={styles.buttonText}>{format.label}</Text>
                      {modelsInFormat > 0 && (
                        <View style={styles.modelCountBadge}>
                          <Text style={styles.modelCountText}>{modelsInFormat}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {selectedModelFormat && (
                <View>
                  <Text style={styles.subtitle}>Select a .gguf file</Text>
                  {isFetching && (
                    <ActivityIndicator size="small" color="#2563EB" />
                  )}
                  {availableGGUFs.length > 0 ? (
                    availableGGUFs.map((file, index) => {
                      const isDownloaded = downloadedModels.includes(file);
                      return (
                        <View key={index} style={styles.modelContainer}>
                          <TouchableOpacity
                            style={[
                              styles.modelButton,
                              selectedGGUF === file && styles.selectedButton,
                            ]}
                            onPress={() =>
                              isDownloaded
                                ? (loadModel(file),
                                  setCurrentPage("conversation"),
                                  setSelectedGGUF(file))
                                : handleGGUFSelection(file)
                            }>
                            <View style={styles.modelButtonContent}>
                              <View style={styles.modelStatusContainer}>
                                {isDownloaded ? (
                                  <View style={styles.downloadedIndicator}>
                                    <Text style={styles.downloadedIcon}>▼</Text>
                                  </View>
                                ) : (
                                  <View style={styles.notDownloadedIndicator}>
                                    <Text style={styles.notDownloadedIcon}>
                                      ▽
                                    </Text>
                                  </View>
                                )}
                                <Text
                                  style={[
                                    styles.buttonTextGGUF,
                                    selectedGGUF === file && styles.selectedButtonText,
                                    isDownloaded && styles.downloadedText,
                                  ]}
                                >
                                  {(file.split("-")[-1] == "imat"
                                    ? file
                                    : file.split("-").pop()).split(".")[0]}
                                </Text>
                                {isDownloaded && (
                                    <Text style={styles.modelSizeText}>
                                      {getModelSize(file)}
                                    </Text>
                                )}
                              </View>
                              <View style={styles.actionButtonsContainer}>
                                {!isDownloaded && (
                                  <View style={styles.downloadIndicator}>
                                    <Text style={styles.downloadText}>
                                      DOWNLOAD →
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                          {isDownloaded && (
                            <View style={styles.modelItemContainer}>
                              <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={(e) => {
                                  e.stopPropagation(); // Prevent triggering the parent TouchableOpacity
                                  deleteModel(file);
                                }}
                              >
                                <Text style={styles.deleteButtonText}>
                                  DELETE ×
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.subtitle2}>
                      {selectedModelFormat ?
                        `No models available for ${selectedModelFormat}. Please check your network connection or download a model.` :
                        `No models available. Please check your network connection.`}
                    </Text>
                  )}
                </View>
              )}

              {/* Showing downloaded models categorized by format */}
              {!selectedModelFormat && downloadedModels.length > 0 && (
                <View style={styles.downloadedModelsSection}>
                  <Text style={styles.subtitle}>Downloaded Models</Text>

                  {/* Group models by format and display each group */}
                  {modelFormats.map(format => {
                    const modelsInFormat = modelMetadata
                      .filter(m => m.format === format.label && downloadedModels.includes(m.filename));

                    if (modelsInFormat.length === 0) return null;

                    return (
                      <View key={format.label} style={styles.formatGroup}>
                        <Text style={styles.formatGroupTitle}>{format.label}</Text>
                        {modelsInFormat.map((model, index) => (
                          <View key={index}>
                            <TouchableOpacity
                              style={styles.modelButton}
                              onPress={() => {
                                loadModel(model.filename);
                                setCurrentPage("conversation");
                                setSelectedGGUF(model.filename);
                              }}
                            >
                              <View style={styles.modelButtonContent}>
                                <View style={styles.modelStatusContainer}>
                                  <View style={styles.downloadedIndicator}>
                                    <Text style={styles.downloadedIcon}>▼</Text>
                                  </View>
                                  <Text style={styles.downloadedText}>
                                    {model.filename.split("-").pop().split(".")[0]}
                                  </Text>
                                  <Text style={styles.modelSizeText}>
                                          {getModelSize(model.filename)}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                            <View style={styles.modelItemContainer}>
                                <View style={styles.deleteButton}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      deleteModel(model.filename);
                                    }}
                                  >
                                    <Text style={styles.deleteButtonText}>
                                      DELETE ×
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
          {currentPage === "conversation" && !isDownloading && (
            <View style={styles.chatWrapper}>
              <Text style={styles.subtitle2}>
                Chatting with {selectedGGUF} ({getModelFormatInfo(selectedGGUF || "")}) - {getModelSize(selectedGGUF || "")}
              </Text>
              <View style={styles.chatContainer}>
                <Text style={styles.greetingText}>
                  🦙 Welcome! The Llama is ready to chat. Ask away! 🎉
                </Text>
                {conversation.slice(1).map((msg, index) => (
                  <View key={index} style={styles.messageWrapper}>
                    <View
                      style={[
                        styles.messageBubble,
                        msg.role === "user"
                          ? styles.userBubble
                          : styles.llamaBubble,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          msg.role === "user" && styles.userMessageText,
                        ]}
                      >
                        {msg.thought && (
                          <TouchableOpacity
                            onPress={() => toggleThought(index + 1)} // +1 to account for slice(1)
                            style={styles.toggleButton}
                          >
                            <Text style={styles.toggleText}>
                              {msg.showThought
                                ? "▼ Hide Thought"
                                : "▶ Show Thought"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {msg.showThought && msg.thought && (
                          <View style={styles.thoughtContainer}>
                            <Text style={styles.thoughtTitle}>
                              Model's Reasoning:
                            </Text>
                            <Text style={styles.thoughtText}>
                              {msg.thought}
                            </Text>
                          </View>
                        )}
                        <Markdown>{msg.content}</Markdown>
                      </Text>
                    </View>
                    {msg.role === "assistant" && (
                      <Text
                        style={styles.tokenInfo}
                        onPress={() => console.log("index : ", index)}
                      >
                        {tokensPerSecond[Math.floor(index / 2)]} tokens/s
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
          {isDownloading && (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Downloading : </Text>
              <Text style={styles.subtitle2}>{selectedGGUF}</Text>
              <ProgressBar progress={progress} />
            </View>
          )}
        </ScrollView>
        <View style={styles.bottomContainer}>
          {currentPage === "conversation" && (
            <>
              <View style={styles.inputContainer}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Type your message..."
                    placeholderTextColor="#94A3B8"
                    value={userInput}
                    onChangeText={setUserInput}
                  />
                  {isGenerating ? (
                    <TouchableOpacity
                      style={styles.stopButton}
                      onPress={stopGeneration}
                    >
                      <Text style={styles.buttonText}>□ Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.sendButton}
                      onPress={handleSendMessage}
                      disabled={isLoading}
                    >
                      <Text style={styles.buttonText}>
                        {isLoading ? "Sending..." : "Send"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackToModelSelection}
              >
                <Text style={styles.backButtonText}>
                  ← Back to Model Selection
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC", // Lighter background for a more modern look
  },
  scrollView: {
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800", // Bolder title
    color: "#1E293B",
    marginVertical: 24,
    textAlign: "center",
    letterSpacing: -0.5, // Tighter letter spacing for modern feel
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20, // Slightly more rounded
    padding: 24,
    margin: 16,
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  subtitle: {
    fontSize: 20, // Slightly larger
    fontWeight: "700", // Bolder
    color: "#334155",
    marginBottom: 18,
    marginTop: 16,
  },
  subtitle2: {
    fontSize: 13, // Slightly larger for better readability
    fontWeight: "600",
    marginBottom: 16,
    color: "#64748B", // More subdued blue
  },
  button: {
    backgroundColor: "#BFDBFE", // Lighter blue
    paddingVertical: 14, // More padding for better touch targets
    paddingHorizontal: 24,
    borderRadius: 14, // Slightly more rounded
    marginVertical: 8,
    shadowColor: "#3B82F6",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#93C5FD", // Light border for definition
  },
  selectedButton: {
    backgroundColor: "#2563EB",
    borderColor: "#1E40AF", // Darker border for selected state
    shadowOpacity: 0.25, // More prominent shadow for selected state
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700", // Bolder text
    textAlign: "center",
  },
  chatWrapper: {
    flex: 1,
    padding: 16,
  },
  backButton: {
    backgroundColor: "#3B82F6",
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 14, // Slightly taller
    paddingHorizontal: 20,
    borderRadius: 14, // Match other elements
    alignItems: "center",
    shadowColor: "#1E40AF",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700", // Bolder
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#F1F5F9", // Slightly darker for better contrast with messages
    borderRadius: 20, // More rounded corners
    padding: 18, // Slightly more padding
    marginBottom: 16,
    shadowColor: "#64748B",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  messageWrapper: {
    marginBottom: 18, // More space between messages
  },
  messageBubble: {
    padding: 14, // More padding
    borderRadius: 16, // More rounded
    maxWidth: "85%", // Slightly wider
    shadowColor: "#64748B",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#3B82F6",
  },
  llamaBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  messageText: {
    fontSize: 16,
    color: "#334155",
    lineHeight: 22, // Better readability
  },
  userMessageText: {
    color: "#FFFFFF",
  },
  tokenInfo: {
    fontSize: 12,
    color: "#64748B", // Slightly darker for better readability
    marginTop: 6,
    textAlign: "right",
    fontWeight: "500", // Medium weight
  },
  inputContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    backgroundColor: "#F8FAFC", // Light background for input
    borderWidth: 1,
    borderColor: "#CBD5E1", // Slightly darker border
    borderRadius: 14, // Match other elements
    padding: 16,
    fontSize: 16,
    color: "#334155",
    minHeight: 50,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  sendButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14, // Match other elements
    shadowColor: "#1E40AF",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  stopButton: {
    backgroundColor: "#EF4444", // Brighter red
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14, // Match other elements
    alignSelf: "stretch",
    justifyContent: "center",
    shadowColor: "#B91C1C",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  greetingText: {
    fontSize: 14, // Larger greeting
    fontWeight: "500",
    textAlign: "center",
    marginVertical: 14,
    color: "#64748B",
    fontStyle: "italic",
  },
  thoughtContainer: {
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    borderLeftWidth: 4, // Slightly thicker accent
    borderLeftColor: "#64748B", // More subtle color
  },
  thoughtTitle: {
    color: "#475569", // Darker for better readability
    fontSize: 13,
    fontWeight: "700", // Bolder
    marginBottom: 4,
  },
  thoughtText: {
    color: "#475569",
    fontSize: 13, // Slightly larger
    fontStyle: "italic",
    lineHeight: 18, // Better line height
  },
  toggleButton: {
    marginTop: 8,
    paddingVertical: 5,
  },
  toggleText: {
    color: "#3B82F6",
    fontSize: 13, // Slightly larger
    fontWeight: "600", // Bolder
  },
  bottomContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  modelContainer: {
    marginVertical: 8, // More spacing
    borderRadius: 14,
    overflow: "hidden",
  },
  modelButton: {
    backgroundColor: "#EFF6FF",
    padding: 19, // More padding
    borderRadius: 14, // Match other elements
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: "#3B82F6",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  modelButtonContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modelStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  downloadedIndicator: {
    backgroundColor: "#BFDBFE", // Darker for better visibility
    padding: 5, // Slightly larger
    borderRadius: 8,
    marginRight: 10,
  },
  notDownloadedIndicator: {
    backgroundColor: "#E2E8F0", // Slightly darker for better visibility
    padding: 5, // Slightly larger
    borderRadius: 8,
    marginRight: 10,
  },
  downloadedIcon: {
    color: "#2563EB", // Brighter blue
    fontSize: 14,
    fontWeight: "bold",
  },
  notDownloadedIcon: {
    color: "#64748B", // Darker for better visibility
    fontSize: 14,
    fontWeight: "bold",
  },
  downloadedText: {
    color: "#1E40AF",
    fontWeight: "600", // Bolder
  },
  loadModelIndicator: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 12,
    paddingVertical: 6, // Slightly taller
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1, // Add border
    borderColor: "#93C5FD", // Light border
  },
  loadModelText: {
    color: "#2563EB", // Brighter blue
    fontSize: 9, // Slightly larger
    fontWeight: "700", // Bolder
    letterSpacing: 0.5,
  },
  downloadIndicator: {
    backgroundColor: "#D1FAE5", // Slightly adjusted green
    paddingHorizontal: 12,
    paddingVertical: 6, // Slightly taller
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1, // Add border
    borderColor: "#A7F3D0", // Light border
  },
  downloadText: {
    color: "#059669", // Slightly darker green for better readability
    fontSize: 9, // Slightly larger
    fontWeight: "700", // Bolder
    letterSpacing: 0.5,
  },
  buttonTextGGUF: {
    color: "#1E40AF",
    fontSize: 14,
    fontWeight: "600", // Bolder
  },
  selectedButtonText: {
    color: "#FFFFFF",
    fontWeight: "700", // Bolder
  },
  modelFormatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modelCountBadge: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  modelCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  formatGroup: {
    marginBottom: 16,
    backgroundColor: "#F1F5F9",
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
  },
  formatGroupTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 120, // Ensure minimum width for proper spacing

  },
  deleteButton: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 0,
    marginRight: 0,
    borderWidth: 1,
    borderColor: "#FECACA",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  deleteButtonText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  downloadedModelsSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 16,
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
  },
  successMessageContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    zIndex: 100,
  },
  successMessage: {
    color: '#059669',
    fontWeight: '600',
  },
  errorMessageContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    zIndex: 100,
  },
  errorMessage: {
    color: '#DC2626',
    fontWeight: '600',
  },
 modelItemContainer: {
   flexDirection: 'row',
   alignItems: 'center',
   justifyContent: 'flex-end', // This aligns children to the right
   marginTop: 10,
   marginBottom: 20,
 },
 // 7. Add new styles for displaying the model size:
 modelTextContainer: {
   flexDirection: 'column',
   justifyContent: 'center',
 },
 modelSizeText: {
   fontSize: 12,
   color: '#64748B',
   fontWeight: '500',
   marginTop: 2,
   marginLeft: 50,
 },
});

export default App;