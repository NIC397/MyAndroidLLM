# MyAndroidLLM

**A Revised Version of the EdgeLLM Project**

MyAndroidLLM is an enhanced version of the EdgeLLM project, which was originally designed to run large language models (LLMs) on edge devices using React Native. The original project, detailed in the [Hugging Face blog post](https://huggingface.co/blog/llm-inference-on-edge), utilizes `llama.rn` to load GGUF files efficiently. This revised version builds upon the foundation provided by the [EdgeLLM repository](https://github.com/MekkCyber/EdgeLLM) and introduces several key improvements.

## Major Added Features

- **Offline Capability**: MyAndroidLLM can run smoothly even when the internet is completely unavailable, ensuring a seamless user experience.
- **Model Deletion**: Users can now delete downloaded models directly from the app, enhancing model management.
- **Model Size Display**: The size of downloaded models is displayed, helping users manage storage more effectively.
- **Optimized Interaction Logic**: The app now features a loading page and a loaded message that disappears once the model is ready, improving user feedback.
- **Improved UI Visuals**: The user interface has been visually enhanced to provide a more engaging and intuitive experience.

## How to Use

1. **Set up the Environment**: Follow instructions from [**React Native Environment Setup**](https://reactnative.dev/docs/set-up-your-environment) to setup the environment.

2. **Clone the Repository**: Clone this repository to your local machine.

3. **Install Dependencies**: Run `npm install` in the project directory.

4. **Start the App on an Emulator/Simulator**: Run `npm start` in the project directory, then in another terminal, run `npm run android` to launch the app on an emulator or simulator.

5. **Installing on Android Phones**: Run ```cd android``` under project root and run ```./gradlew assembleRelease``` to create an installable APK file under ```android/app/build/outputs/apk/release```.

## Acknowledgments

This project is built upon the work done in the [EdgeLLM repository](https://github.com/MekkCyber/EdgeLLM) and the tutorial provided by Hugging Face. The original project's focus on integrating AI into mobile applications and running LLMs locally has been expanded with additional features to enhance usability and functionality.

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues to suggest new features or improvements.