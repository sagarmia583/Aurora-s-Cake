import React from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';

const STAFF_WEB = 'https://aurorascake.netlify.app/?staff=1';
type StartupCode = 'STARTUP_MODULE' | 'STARTUP_RENDER';

let Workspace: React.ComponentType | undefined;
try {
  // Evaluate the workspace here so Metro module failures have a visible fallback.
  Workspace = require('./src/native/FontBootstrap').default;
} catch (error) {
  console.error('Aurora staff startup module failed', error);
}

function StartupMessage({code, onRetry}: {code: StartupCode; onRetry?: () => void}) {
  const [linkFailed, setLinkFailed] = React.useState(false);
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>স্টাফ অ্যাপ খুলতে সমস্যা হয়েছে</Text>
      <Text accessibilityRole="alert" style={styles.text}>অ্যাপ আবার খুলে দেখুন। সমস্যা থাকলে নিচের কোডটি জানান।</Text>
      <Text selectable style={styles.code}>{code}</Text>
      {onRetry && <Pressable accessibilityRole="button" style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>আবার চেষ্টা করুন</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
        setLinkFailed(false);
        void Linking.openURL(STAFF_WEB).catch(() => setLinkFailed(true));
      }}>
        <Text style={styles.buttonText}>ব্রাউজারে Staff panel খুলুন</Text>
      </Pressable>
      {linkFailed && <Text accessibilityRole="alert" style={styles.text}>ব্রাউজার খুলতে পারেনি।</Text>}
    </View>
  );
}

class StartupBoundary extends React.Component<React.PropsWithChildren, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {
    return {failed: true};
  }
  componentDidCatch(error: Error) {
    console.error('Aurora staff screen failed', error);
  }
  render() {
    return this.state.failed
      ? <StartupMessage code="STARTUP_RENDER" onRetry={() => this.setState({failed: false})}/>
      : this.props.children;
  }
}

export default function App() {
  return Workspace
    ? <StartupBoundary><Workspace/></StartupBoundary>
    : <StartupMessage code="STARTUP_MODULE"/>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, justifyContent: 'center', backgroundColor: '#FCF8F3', padding: 24, gap: 16},
  title: {fontSize: 23, fontWeight: '700', color: '#292333'},
  text: {fontSize: 16, color: '#403642'},
  code: {fontSize: 14, color: '#803C55', fontWeight: '700'},
  button: {alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#174B3B'},
  buttonText: {fontWeight: '700', color: '#FFF'},
});
