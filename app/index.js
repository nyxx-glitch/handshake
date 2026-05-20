import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native'
import React from 'react'
import { router } from 'expo-router';

export default function Index() {
    
return (
    <View style={styles.container}> 
    <Image
  source={require('../assets/images/handshake1.png')}
  style={styles.logo}
  resizeMode="contain"
/>
    <Text style={styles.title}>HandShake</Text>
    <Text style={styles.subtitle}>Your step toward connecting to the world of signs.</Text>
    
    <TouchableOpacity 
    style={styles.button}
    onPress={() => router.push('/camera')}>
    <Text style={styles.buttonText}>Get Started</Text>
    </TouchableOpacity>

    
    </View>
);
}

                   
const styles = StyleSheet.create({
container:{ 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
},
title: {       
    fontFamily: 'georgia', 
    fontSize: 36,
    fontWeight: '700',
    color: '#693716',
    marginBottom: 8,
},
subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 60,
    fontFamily: 'georgia',
},

button: {
    backgroundColor: '#491f07',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: 200,
    alignItems: 'center',
},
buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
},
secondaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#491f07',
    width: 200,
    alignItems: 'center',
},
secondaryButtonText: {
    color: '#491f07',
    fontSize: 18,
    fontWeight: '700',
},
logo: {
    width: 450,
    height: 250,
    marginBottom: 10,
},
});