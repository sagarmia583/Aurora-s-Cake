import React, {useRef, useState} from 'react';
import {Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View, type TextInput as NativeInput} from 'react-native';
import {signIn} from './client';
import {Text, TextInput} from './typography';
import {BrandLogo, Button, C, T, pressFeedback} from './ui';

export default function LoginScreen({logoUrl, error, onRetry, onSignedIn}: {
  logoUrl?: string;
  error: string;
  onRetry: () => void;
  onSignedIn: (auth: Awaited<ReturnType<typeof signIn>>) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [focused, setFocused] = useState<'username' | 'password' | null>(null);
  const passwordRef = useRef<React.ComponentRef<typeof NativeInput>>(null);
  const inFlight = useRef(false);
  const canSubmit = !!username.trim() && !!password;

  const submit = async () => {
    if (!canSubmit || inFlight.current) return;
    if (Platform.OS === 'web') {
      setMessage('এটি লোকাল preview। ফোনের অ্যাপ থেকে সাইন ইন করুন।');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    Keyboard.dismiss();
    try {
      onSignedIn(await signIn(username, password));
    } catch (failure) {
      setMessage((failure as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <View style={T.page}>
    <StatusBar barStyle="dark-content"/>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    >
      <View style={styles.panel}>
        <View style={styles.brand}>
          <BrandLogo uri={logoUrl} size={44}/>
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>Aurora’s Cake</Text>
            <Text style={styles.brandCaption}>BAKERY STAFF</Text>
          </View>
          <Text accessible={false} style={styles.sparkle}>✦</Text>
        </View>
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.title}>স্টাফ সাইন ইন</Text>
          <Text style={T.sub}>আজকের অর্ডার ও কাজ দেখতে সাইন ইন করুন।</Text>
          {!!(message || error) && <Text accessibilityRole="alert" style={T.error}>{message || error}</Text>}
          <View style={styles.field}>
            <Text style={styles.label}>ইউজারনেম</Text>
            <TextInput accessibilityLabel="Staff username" autoComplete="username" autoCapitalize="none" autoCorrect={false}
              editable={!busy} value={username} onChangeText={setUsername} returnKeyType="next" submitBehavior="submit"
              onFocus={() => setFocused('username')} onBlur={() => setFocused(null)} onSubmitEditing={() => passwordRef.current?.focus()}
              style={[styles.input, focused === 'username' && styles.focused]}/>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>পাসওয়ার্ড</Text>
            <View style={[styles.passwordRow, focused === 'password' && styles.focused]}>
              <TextInput ref={passwordRef} accessibilityLabel="Password" autoComplete="current-password" autoCapitalize="none"
                autoCorrect={false} secureTextEntry={!showPassword} editable={!busy} value={password} onChangeText={setPassword}
                returnKeyType="go" onSubmitEditing={() => void submit()}
                onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} style={styles.passwordInput}/>
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword(current => !current)}
                style={({pressed}) => [styles.visibility, pressed && pressFeedback]}>
                <Text style={T.link}>{showPassword ? 'লুকান' : 'দেখুন'}</Text>
              </Pressable>
            </View>
          </View>
          <Button label="সাইন ইন →" busy={busy} disabled={!canSubmit} onPress={() => void submit()}/>
          {!!error && <Button label="Saved session আবার যাচাই করুন" kind="ghost" onPress={onRetry}/>}
        </View>
      </View>
      <Text style={styles.footer}>{Platform.OS === 'web' ? 'LOCAL LOGIN PREVIEW' : 'অ্যাকাউন্টের জন্য দোকানের admin-এর সঙ্গে যোগাযোগ করুন।'}</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  scroll: {flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center'},
  content: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 24, paddingBottom: 20, gap: 12},
  panel: {backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 24},
  brand: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.dark, borderTopLeftRadius: 23, borderTopRightRadius: 23},
  brandCopy: {flex: 1, minWidth: 0, gap: 2},
  brandName: {color: C.paper, fontSize: 17, fontWeight: '800'},
  brandCaption: {color: C.peach, fontSize: 10, letterSpacing: 1.5, fontWeight: '700'},
  sparkle: {color: C.peach, fontSize: 20},
  form: {padding: 16, gap: 10},
  title: {color: C.ink, fontSize: 23, lineHeight: 32, fontWeight: '800'},
  field: {gap: 4},
  label: {color: C.ink, fontSize: 12, fontWeight: '700'},
  input: {minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.bg, color: C.ink, fontSize: 15},
  focused: {borderColor: C.brand, backgroundColor: C.paper},
  passwordRow: {minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, flexDirection: 'row', alignItems: 'center'},
  passwordInput: {flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, color: C.ink, fontSize: 15},
  visibility: {minHeight: 44, minWidth: 58, alignItems: 'center', justifyContent: 'center'},
  footer: {color: C.sub, fontSize: 11, lineHeight: 17, textAlign: 'center'},
});
