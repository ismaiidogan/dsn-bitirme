//go:build windows

package storage

import (
	"syscall"
	"unsafe"
)

func diskFreeBytes(path string) int64 {
	_, free, _ := getDiskSpaceEx(path)
	return free
}

func diskTotalBytes(path string) int64 {
	total, _, _ := getDiskSpaceEx(path)
	return total
}

func getDiskSpaceEx(path string) (total, free, totalFree int64) {
	pathPtr, _ := syscall.UTF16PtrFromString(path)
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeExW := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	getDiskFreeExW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	return int64(totalBytes), int64(freeBytesAvailable), int64(totalFreeBytes)
}
