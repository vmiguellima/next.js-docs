'use client'

import React, {
  useRef,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  forwardRef,
  version,
} from 'react'
import Head from '../shared/lib/head'
import { getImgProps } from '../shared/lib/get-img-props'
import type {
  ImageProps,
  ImgProps,
  OnLoad,
  OnLoadingComplete,
  PlaceholderValue,
} from '../shared/lib/get-img-props'
import type {
  ImageConfigComplete,
  ImageLoaderProps,
} from '../shared/lib/image-config'
import { imageConfigDefault } from '../shared/lib/image-config'
import { ImageConfigContext } from '../shared/lib/image-config-context'
import { warnOnce } from '../shared/lib/utils/warn-once'

// @ts-ignore - This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

// This is replaced by webpack define plugin
const configEnv = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete

if (typeof window === 'undefined') {
  ;(globalThis as any).__NEXT_IMAGE_IMPORTED = true
}

export type { ImageLoaderProps }
export type ImageLoader = (p: ImageLoaderProps) => string

type ImgElementWithDataProp = HTMLImageElement & {
  'data-loaded-src': string | undefined
}

type ImageElementProps = ImgProps & {
  unoptimized: boolean
  placeholder: PlaceholderValue
  onLoadRef: React.MutableRefObject<OnLoad | undefined>
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>
  setBlurComplete: (b: boolean) => void
  setShowAltText: (b: boolean) => void
}

// See https://stackoverflow.com/q/39777833/266535 for why we use this ref
// handler instead of the img's onLoad attribute.
function handleLoading(
  img: ImgElementWithDataProp,
  placeholder: PlaceholderValue,
  onLoadRef: React.MutableRefObject<OnLoad | undefined>,
  onLoadingCompleteRef: React.MutableRefObject<OnLoadingComplete | undefined>,
  setBlurComplete: (b: boolean) => void,
  unoptimized: boolean
) {
  const src = img?.src
  if (!img || img['data-loaded-src'] === src) {
    return
  }
  img['data-loaded-src'] = src
  const p = 'decode' in img ? img.decode() : Promise.resolve()
  p.catch(() => {}).then(() => {
    if (!img.parentElement || !img.isConnected) {
      // Exit early in case of race condition:
      // - onload() is called
      // - decode() is called but incomplete
      // - unmount is called
      // - decode() completes
      return
    }
    if (placeholder === 'blur') {
      setBlurComplete(true)
    }
    if (onLoadRef?.current) {
      // Since we don't have the SyntheticEvent here,
      // we must create one with the same shape.
      // See https://reactjs.org/docs/events.html
      const event = new Event('load')
      Object.defineProperty(event, 'target', { writable: false, value: img })
      let prevented = false
      let stopped = false
      onLoadRef.current({
        ...event,
        nativeEvent: event,
        currentTarget: img,
        target: img,
        isDefaultPrevented: () => prevented,
        isPropagationStopped: () => stopped,
        persist: () => {},
        preventDefault: () => {
          prevented = true
          event.preventDefault()
        },
        stopPropagation: () => {
          stopped = true
          event.stopPropagation()
        },
      })
    }
    if (onLoadingCompleteRef?.current) {
      onLoadingCompleteRef.current(img)
    }
    if (process.env.NODE_ENV !== 'production') {
      const origSrc = new URL(src, 'http://n').searchParams.get('url') || src
      if (img.getAttribute('data-nimg') === 'fill') {
        if (
          !unoptimized &&
          (!img.getAttribute('sizes') || img.getAttribute('sizes') === '100vw')
        ) {
          let widthViewportRatio =
            img.getBoundingClientRect().width / window.innerWidth
          if (widthViewportRatio < 0.6) {
            warnOnce(
              `Image with src "${origSrc}" has "fill" but is missing "sizes" prop. Please add it to improve page performance. Read more: https://nextjs.org/docs/api-reference/next/image#sizes`
            )
          }
        }
        if (img.parentElement) {
          const { position } = window.getComputedStyle(img.parentElement)
          const valid = ['absolute', 'fixed', 'relative']
          if (!valid.includes(position)) {
            warnOnce(
              `Image with src "${origSrc}" has "fill" and parent element with invalid "position". Provided "${position}" should be one of ${valid
                .map(String)
                .join(',')}.`
            )
          }
        }
        if (img.height === 0) {
          warnOnce(
            `Image with src "${origSrc}" has "fill" and a height value of 0. This is likely because the parent element of the image has not been styled to have a set height.`
          )
        }
      }

      const heightModified =
        img.height.toString() !== img.getAttribute('height')
      const widthModified = img.width.toString() !== img.getAttribute('width')
      if (
        (heightModified && !widthModified) ||
        (!heightModified && widthModified)
      ) {
        warnOnce(
          `Image with src "${origSrc}" has either width or height modified, but not the other. If you use CSS to change the size of your image, also include the styles 'width: "auto"' or 'height: "auto"' to maintain the aspect ratio.`
        )
      }
    }
  })
}

function getDynamicProps(
  fetchPriority?: string
): Record<string, string | undefined> {
  const [majorStr, minorStr] = version.split('.')
  const major = parseInt(majorStr, 10)
  const minor = parseInt(minorStr, 10)
  if (major > 18 || (major === 18 && minor >= 3)) {
    // In React 18.3.0 or newer, we must use camelCase
    // prop to avoid "Warning: Invalid DOM property".
    // See https://github.com/facebook/react/pull/25927
    return { fetchPriority }
  }
  // In React 18.2.0 or older, we must use lowercase prop
  // to avoid "Warning: Invalid DOM property".
  return { fetchpriority: fetchPriority }
}

const ImageElement = forwardRef<HTMLImageElement | null, ImageElementProps>(
  (
    {
      src,
      srcSet,
      sizes,
      height,
      width,
      decoding,
      className,
      style,
      fetchPriority,
      placeholder,
      loading,
      unoptimized,
      fill,
      onLoadRef,
      onLoadingCompleteRef,
      setBlurComplete,
      setShowAltText,
      onLoad,
      onError,
      ...rest
    },
    forwardedRef
  ) => {
    return (
      <img
        {...rest}
        {...getDynamicProps(fetchPriority)}
        // It's intended to keep `loading` before `src` because React updates
        // props in order which causes Safari/Firefox to not lazy load properly.
        // See https://github.com/facebook/react/issues/25883
        loading={loading}
        width={width}
        height={height}
        decoding={decoding}
        data-nimg={fill ? 'fill' : '1'}
        className={className}
        style={style}
        // It's intended to keep `src` the last attribute because React updates
        // attributes in order. If we keep `src` the first one, Safari will
        // immediately start to fetch `src`, before `sizes` and `srcSet` are even
        // updated by React. That causes multiple unnecessary requests if `srcSet`
        // and `sizes` are defined.
        // This bug cannot be reproduced in Chrome or Firefox.
        sizes={sizes}
        srcSet={srcSet}
        src={src}
        ref={useCallback(
          (img: ImgElementWithDataProp | null) => {
            if (forwardedRef) {
              if (typeof forwardedRef === 'function') forwardedRef(img)
              else if (typeof forwardedRef === 'object') {
                // @ts-ignore - .current is read only it's usually assigned by react internally
                forwardedRef.current = img
              }
            }
            if (!img) {
              return
            }
            if (onError) {
              // If the image has an error before react hydrates, then the error is lost.
              // The workaround is to wait until the image is mounted which is after hydration,
              // then we set the src again to trigger the error handler (if there was an error).
              // eslint-disable-next-line no-self-assign
              img.src = img.src
            }
            if (process.env.NODE_ENV !== 'production') {
              if (!src) {
                console.error(`Image is missing required "src" property:`, img)
              }
              if (img.getAttribute('alt') === null) {
                console.error(
                  `Image is missing required "alt" property. Please add Alternative Text to describe the image for screen readers and search engines.`
                )
              }
            }
            if (img.complete) {
              handleLoading(
                img,
                placeholder,
                onLoadRef,
                onLoadingCompleteRef,
                setBlurComplete,
                unoptimized
              )
            }
          },
          [
            src,
            placeholder,
            onLoadRef,
            onLoadingCompleteRef,
            setBlurComplete,
            onError,
            unoptimized,
            forwardedRef,
          ]
        )}
        onLoad={(event) => {
          const img = event.currentTarget as ImgElementWithDataProp
          handleLoading(
            img,
            placeholder,
            onLoadRef,
            onLoadingCompleteRef,
            setBlurComplete,
            unoptimized
          )
        }}
        onError={(event) => {
          // if the real image fails to load, this will ensure "alt" is visible
          setShowAltText(true)
          if (placeholder === 'blur') {
            // If the real image fails to load, this will still remove the placeholder.
            setBlurComplete(true)
          }
          if (onError) {
            onError(event)
          }
        }}
      />
    )
  }
)

export const Image = forwardRef<HTMLImageElement | null, ImageProps>(
  (props, forwardedRef) => {
    const configContext = useContext(ImageConfigContext)
    const config = useMemo(() => {
      const c = configEnv || configContext || imageConfigDefault
      const allSizes = [...c.deviceSizes, ...c.imageSizes].sort((a, b) => a - b)
      const deviceSizes = c.deviceSizes.sort((a, b) => a - b)
      return { ...c, allSizes, deviceSizes }
    }, [configContext])

    const { onLoad, onLoadingComplete } = props
    const onLoadRef = useRef(onLoad)

    useEffect(() => {
      onLoadRef.current = onLoad
    }, [onLoad])

    const onLoadingCompleteRef = useRef(onLoadingComplete)

    useEffect(() => {
      onLoadingCompleteRef.current = onLoadingComplete
    }, [onLoadingComplete])

    const [blurComplete, setBlurComplete] = useState(false)
    const [showAltText, setShowAltText] = useState(false)

    const { props: imgAttributes, meta: imgMeta } = getImgProps(props, {
      defaultLoader,
      imgConf: config,
      blurComplete,
      showAltText,
    })

    return (
      <>
        {
          <ImageElement
            {...imgAttributes}
            unoptimized={imgMeta.unoptimized}
            placeholder={imgMeta.placeholder}
            fill={imgMeta.fill}
            onLoadRef={onLoadRef}
            onLoadingCompleteRef={onLoadingCompleteRef}
            setBlurComplete={setBlurComplete}
            setShowAltText={setShowAltText}
            ref={forwardedRef}
          />
        }
        {imgMeta.priority ? (
          // Note how we omit the `href` attribute, as it would only be relevant
          // for browsers that do not support `imagesrcset`, and in those cases
          // it would likely cause the incorrect image to be preloaded.
          //
          // https://html.spec.whatwg.org/multipage/semantics.html#attr-link-imagesrcset
          <Head>
            <link
              key={
                '__nimg-' +
                imgAttributes.src +
                imgAttributes.srcSet +
                imgAttributes.sizes
              }
              rel="preload"
              as="image"
              href={imgAttributes.srcSet ? undefined : imgAttributes.src}
              imageSrcSet={imgAttributes.srcSet}
              imageSizes={imgAttributes.sizes}
              crossOrigin={imgAttributes.crossOrigin}
              referrerPolicy={imgAttributes.referrerPolicy}
              {...getDynamicProps(imgAttributes.fetchPriority)}
            />
          </Head>
        ) : null}
      </>
    )
  }
)
