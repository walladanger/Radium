import { describe, it, expect } from 'vitest'
import {
  dedupeGpusForFallback,
  adaptGpuToFallbackDevice,
  buildFallbackDevices,
} from '../gpuFallback'
import type { GPU } from '@/hooks/useHardware'

const mockGpuNvml: GPU = {
  name: 'NVIDIA GeForce RTX 3080',
  vendor: 'NVIDIA',
  total_memory: 10240,
  uuid: 'GPU-12345678-1234-1234-1234-123456789abc',
  driver_version: '555.44',
  nvidia_info: {
    index: 0,
    compute_capability: '8.6',
  },
  vulkan_info: {
    index: 0,
    device_id: 0x2206,
    device_type: 'DISCRETE_GPU',
    api_version: '1.3.277',
  },
}

const mockGpuVulkan: GPU = {
  name: 'NVIDIA GeForce RTX 3080',
  vendor: 'NVIDIA',
  total_memory: 10240,
  uuid: 'vulkan-uuid-87654321',
  driver_version: '555.44',
  // @ts-expect-error - simulating absence of nvidia_info
  nvidia_info: null,
  vulkan_info: {
    index: 1,
    device_id: 0x2206,
    device_type: 'DISCRETE_GPU',
    api_version: '1.3.277',
  },
}

const mockGpuAmd: GPU = {
  name: 'AMD Radeon RX 7900 XTX',
  vendor: 'AMD',
  total_memory: 24576,
  uuid: 'vulkan-uuid-amd',
  driver_version: '23.4.1',
  // @ts-expect-error
  nvidia_info: null,
  vulkan_info: {
    index: 0,
    device_id: 0x744c,
    device_type: 'DISCRETE_GPU',
    api_version: '1.3.277',
  },
}

const mockGpuMissingUuid: GPU = {
  name: 'Unknown GPU',
  vendor: 'Unknown',
  total_memory: 4096,
  uuid: '',
  driver_version: '1.0',
  // @ts-expect-error
  nvidia_info: null,
  vulkan_info: {
    index: 2,
    device_id: 0x0000,
    device_type: 'OTHER',
    api_version: '1.0.0',
  },
}

describe('dedupeGpusForFallback', () => {
  it('returns an empty array when given an empty input', () => {
    expect(dedupeGpusForFallback([])).toEqual([])
  })

  it('preserves the order and returns distinct GPUs', () => {
    const input = [mockGpuAmd, mockGpuNvml]
    const result = dedupeGpusForFallback(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(mockGpuAmd)
    expect(result[1]).toBe(mockGpuNvml)
  })

  it('removes duplicates based on (vendor, name, total_memory) preferring nvidia_info', () => {
    // Vulkan first, NVML second. The NVML entry should win because of the nvidia_info
    const input = [mockGpuVulkan, mockGpuNvml]
    const result = dedupeGpusForFallback(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(mockGpuNvml)

    // NVML first, Vulkan second. The NVML entry should still win.
    const input2 = [mockGpuNvml, mockGpuVulkan]
    const result2 = dedupeGpusForFallback(input2)
    expect(result2).toHaveLength(1)
    expect(result2[0]).toBe(mockGpuNvml)
  })

  it('keeps the first entry if both have equal score (e.g. both lack nvidia_info)', () => {
    const mockGpuVulkanDuplicate = { ...mockGpuVulkan, uuid: 'another-uuid' }
    const input = [mockGpuVulkan, mockGpuVulkanDuplicate]
    const result = dedupeGpusForFallback(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(mockGpuVulkan)
  })
})

describe('adaptGpuToFallbackDevice', () => {
  it('maps fields correctly for a standard GPU', () => {
    const result = adaptGpuToFallbackDevice(mockGpuNvml)
    expect(result).toEqual({
      id: 'GPU-12345678-1234-1234-1234-123456789abc',
      name: 'NVIDIA GeForce RTX 3080',
      vendor: 'NVIDIA',
      totalMemoryMiB: 10240,
    })
  })

  it('falls back to vendor::name for id if uuid is missing or empty', () => {
    const result = adaptGpuToFallbackDevice(mockGpuMissingUuid)
    expect(result).toEqual({
      id: 'Unknown::Unknown GPU',
      name: 'Unknown GPU',
      vendor: 'Unknown',
      totalMemoryMiB: 4096,
    })
  })
})

describe('buildFallbackDevices', () => {
  it('returns an empty array when given an empty list', () => {
    expect(buildFallbackDevices([])).toEqual([])
  })

  it('dedupes, adapts, and sorts by totalMemoryMiB descending', () => {
    const input = [mockGpuMissingUuid, mockGpuVulkan, mockGpuNvml, mockGpuAmd]
    const result = buildFallbackDevices(input)

    expect(result).toHaveLength(3)

    // First: AMD (24576)
    expect(result[0]).toEqual({
      id: 'vulkan-uuid-amd',
      name: 'AMD Radeon RX 7900 XTX',
      vendor: 'AMD',
      totalMemoryMiB: 24576,
    })

    // Second: NVIDIA (10240) - the NVML version should win the dedupe
    expect(result[1]).toEqual({
      id: 'GPU-12345678-1234-1234-1234-123456789abc',
      name: 'NVIDIA GeForce RTX 3080',
      vendor: 'NVIDIA',
      totalMemoryMiB: 10240,
    })

    // Third: Unknown (4096)
    expect(result[2]).toEqual({
      id: 'Unknown::Unknown GPU',
      name: 'Unknown GPU',
      vendor: 'Unknown',
      totalMemoryMiB: 4096,
    })
  })
})
