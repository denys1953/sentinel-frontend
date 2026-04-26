import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

export function useSemanticSearch() {
  const [isReady, setIsReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  
  const extractorRef = useRef(null);
  const embeddingsCache = useRef(new Map());

  const initModel = useCallback(async () => {
    if (extractorRef.current || modelLoading) return;
    
    try {
      setModelLoading(true);
      setError(null);
      const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
        progress_callback: (data) => {
          if (data.status === 'progress') {
            setProgress(Math.round(data.progress));
          }
        }
      });
      
      extractorRef.current = extractor;
      setIsReady(true);
    } catch (err) {
      console.error('Failed to load semantic search model', err);
      setError('Не вдалося завантажити модель пошуку');
    } finally {
      setModelLoading(false);
    }
  }, [modelLoading]);

  const getEmbedding = async (text) => {
    if (!extractorRef.current) return null;
    try {
      const output = await extractorRef.current(text, {
        pooling: 'mean',
        normalize: true,
      });
      return output.data;
    } catch (err) {
      console.error('Embedding error', err);
      return null;
    }
  };

  const cosineSimilarity = (vecA, vecB) => {
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; ++i) {
        dotProduct += vecA[i] * vecB[i];
    }
    return dotProduct; 
  };

  const indexMessages = useCallback(async (messages) => {
    if (!extractorRef.current) return;
    
    for (const msg of messages) {
      if (!msg.content || embeddingsCache.current.has(msg.id)) continue;
      const embedding = await getEmbedding(msg.content);
      if (embedding) {
        embeddingsCache.current.set(msg.id, embedding);
      }
    }
  }, []);

  const clearCache = useCallback(() => {
    embeddingsCache.current.clear();
  }, []);

  const search = useCallback(async (query, messages) => {
    if (!isReady || !query.trim()) return [];
    
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) return [];

    const results = [];
    
    for (const msg of messages) {
      if (!msg.content) continue;
      
      let msgEmbedding = embeddingsCache.current.get(msg.id);
      
      if (!msgEmbedding) {
         msgEmbedding = await getEmbedding(msg.content);
         if (msgEmbedding) {
            embeddingsCache.current.set(msg.id, msgEmbedding);
         }
      }
      
      if (msgEmbedding) {
        const similarity = cosineSimilarity(queryEmbedding, msgEmbedding);
        const wordCount = query.trim().split(/\s+/).length;
        let threshold = 0.40; 
        if (wordCount === 1) threshold = 0.30;
        else if (wordCount === 2) threshold = 0.35;
        
        const isExactMatch = query.length > 2 && msg.content.toLowerCase().includes(query.toLowerCase());
        
        if (similarity > threshold || isExactMatch) {
          results.push({ 
            message: msg, 
            similarity: isExactMatch ? similarity + 1.0 : similarity 
          });
        }
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .map(r => r.message);
  }, [isReady]);

  return {
    isReady,
    modelLoading,
    progress,
    error,
    initModel,
    indexMessages,
    search,
    clearCache
  };
}
