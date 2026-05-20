import { StyleSheet, Text, View, TextInput, FlatList, Image, TouchableOpacity, Dimensions } from 'react-native';
import React, { useState, useMemo } from 'react';
import { router } from 'expo-router';
import { SIGN_LABELS } from '../constants/labels';
import { REFERENCE_IMAGES } from '../src/constants/referenceImages';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const CARD_MARGIN = 8;
const GRID_PADDING = 12;
const CARD_WIDTH = (width - (GRID_PADDING * 2) - (CARD_MARGIN * 2 * COLUMN_COUNT)) / COLUMN_COUNT;

const Reference = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLabels = useMemo(() => {
    const validLabels = SIGN_LABELS.filter(label => label !== 'Idle');
    
    let filtered = validLabels;
    if (searchQuery) {
      filtered = validLabels.filter(label => 
        label.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    const letters = filtered.filter(label => /^[A-ZÑ]$/i.test(label));
    const numbers = filtered.filter(label => /^[0-9]$/.test(label));

    const sections = [];
    if (letters.length > 0) {
      sections.push({ title: 'Letters', data: letters });
    }
    if (numbers.length > 0) {
      sections.push({ title: 'Numbers', data: numbers });
    }
    return sections;
  }, [searchQuery]);

  const renderSection = (section) => (
    <View key={section.title} style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionLine} />
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.sectionLine} />
      </View>
      <View style={styles.grid}>
        {section.data.map(label => (
          <View key={label} style={styles.card}>
            <View style={styles.imageContainer}>
              {REFERENCE_IMAGES[label] ? (
                <Image 
                  source={REFERENCE_IMAGES[label]} 
                  style={styles.image} 
                  resizeMode="contain" 
                />
              ) : (
                <View style={styles.placeholderImage}>
                  <Text style={styles.placeholderText}>?</Text>
                </View>
              )}
            </View>
            <View style={styles.labelContainer}>
              <Text style={styles.labelText}>{label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>References</Text>
            <Text style={styles.subtitle}>Learn the hand signs</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#8D5B3E" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search sign..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#BC9881"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#BC9881" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredLabels}
        renderItem={({ item }) => renderSection(item)}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={64} color="#BC9881" />
            <Text style={styles.emptyText}>No signs found matching &quot;{searchQuery}&quot;</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default Reference;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#491f07', 
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#D2B48C', 
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 15,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#491f07',
    fontWeight: '500',
  },
  listContainer: {
    paddingBottom: 30,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D2B48C',
    marginHorizontal: 15,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(210, 180, 140, 0.3)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    justifyContent: 'center',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: CARD_MARGIN,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  imageContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.1,
    backgroundColor: '#FDF5E6', 
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  placeholderText: {
    fontSize: 40,
    color: '#cbd5e1',
    fontWeight: 'bold',
  },
  labelContainer: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  labelText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#491f07',
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#D2B48C',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});