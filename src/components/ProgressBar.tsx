import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface ProgressBarProps {
  progress: number; // Percentage (0–100)
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const clampedProgress = Math.max(0, Math.min(progress, 100));

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { width: `${clampedProgress}%` }]} />
      <Text style={styles.text}>{clampedProgress}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 20,
    backgroundColor: "#444",
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 10,
  },
  bar: {
    height: "100%",
    backgroundColor: "#2563EB",
  },
  text: {
    position: "absolute",
    alignSelf: "center",
    color: "#fff",
    fontSize: 12,
  },
});

export default ProgressBar;